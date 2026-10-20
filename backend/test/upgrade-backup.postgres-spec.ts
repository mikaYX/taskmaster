import { execFile } from 'child_process';
import { promisify } from 'util';
import 'reflect-metadata';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Pool } from 'pg';
import { ConfigService } from '@nestjs/config';
import { BackupLogicService } from '../src/backup/backup.logic';
import { EncryptionService } from '../src/backup/encryption.service';
import { SettingsService } from '../src/settings';

const testUrl = process.env.TASKMASTER_UPGRADE_TEST_DATABASE_URL;
const suite = testUrl ? describe : describe.skip;

suite('legacy upgrade and real encrypted PostgreSQL restore', () => {
  let pool: Pool;
  let root: string;
  let backup: BackupLogicService;
  let legacy: { users: unknown[]; tasks: unknown[]; statuses: unknown[] };
  let environment: NodeJS.ProcessEnv;
  const evidenceId = 'af273756-e1e8-4a86-83e9-c6f13ecc1892';
  const migrationRoot = join(__dirname, '../prisma/migrations');
  const upgrade = '20261016000000_task_execution';
  const prisma = (args: string[]) =>
    promisify(execFile)(
      process.execPath,
      [require.resolve('prisma/build/index.js'), ...args],
      {
        cwd: join(__dirname, '..'),
        env: { ...process.env, DATABASE_URL: testUrl },
        timeout: 30000,
      },
    );

  async function rows(table: string, strip = '') {
    // table/strip are internal constants, never request input.
    return (
      await pool.query(
        `SELECT to_jsonb(t) ${strip} AS record FROM "${table}" t ORDER BY id`,
      )
    ).rows.map((row) => row.record);
  }

  beforeAll(async () => {
    const url = new URL(testUrl!);
    if (url.pathname !== '/taskmaster_upgrade_test')
      throw new Error('Use an isolated database named taskmaster_upgrade_test');
    pool = new Pool({ connectionString: testUrl });
    const tables = await pool.query(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public'",
    );
    if (tables.rowCount)
      throw new Error('Upgrade test requires an empty disposable database');
    environment = { ...process.env };
    root = mkdtempSync(join(tmpdir(), 'taskmaster upgrade restore '));
    process.env.TASKMASTER_DATA_DIR = root;
    // A dedicated explicit value is the only database this test can dump/restore.
    const config = {
      get: (key: string) =>
        key === 'DATABASE_URL'
          ? testUrl
          : key === 'BACKUP_ENCRYPTION_KEY'
            ? 'upgrade-test-only-encryption-key'
            : undefined,
    } as ConfigService;
    backup = new BackupLogicService(
      config,
      { getRawValue: async () => null } as unknown as SettingsService,
      new EncryptionService(config),
    );
    for (const name of readdirSync(migrationRoot)
      .filter((name) => name < upgrade)
      .sort()) {
      if (/^\d/.test(name)) {
        await pool.query(
          readFileSync(join(migrationRoot, name, 'migration.sql'), 'utf8'),
        );
        await prisma(['migrate', 'resolve', '--applied', name]);
      }
    }
    await pool.query(`
      INSERT INTO sites(name, code, updated_at) VALUES ('Legacy site', 'UPGRADE', NOW());
      INSERT INTO users(username, fullname, password_hash, updated_at) VALUES ('legacy-user', 'Legacy operator', 'test-only-hash', NOW());
      INSERT INTO tasks(name, description, periodicity, start_date, site_id, updated_at) VALUES ('Legacy task', 'Keep this description', 'daily', '2026-10-16', 1, NOW());
      INSERT INTO statuses(task_id, instance_date, status, comment, updated_at) VALUES (1, '2026-10-16', 'FAILED', 'Historical comment', NOW());
    `);
    legacy = {
      users: await rows('users'),
      tasks: await rows('tasks'),
      statuses: await rows('statuses'),
    };
  });
  afterAll(async () => {
    await pool?.end();
    if (environment) process.env = environment;
    if (root) rmSync(root, { recursive: true, force: true });
  });

  it('applies the additive migration to the previous SQL schema without changing existing rows', async () => {
    await prisma(['migrate', 'deploy']);
    expect(
      (
        await pool.query(
          'SELECT migration_name FROM _prisma_migrations WHERE migration_name=$1 AND finished_at IS NOT NULL',
          [upgrade],
        )
      ).rowCount,
    ).toBe(1);
    expect(await rows('users', "- 'guest_view'")).toEqual(legacy.users);
    expect(await rows('tasks', "- 'execution_checklist'")).toEqual(
      legacy.tasks,
    );
    expect(await rows('statuses', "- 'execution_record'")).toEqual(
      legacy.statuses,
    );
    expect(
      (await pool.query('SELECT execution_checklist FROM tasks')).rows[0]
        .execution_checklist,
    ).toEqual([]);
    expect(
      (await pool.query('SELECT execution_record FROM statuses')).rows[0]
        .execution_record,
    ).toBeNull();
  });

  it('enforces corrective action uniqueness and referential integrity after upgrade', async () => {
    await pool.query(
      "INSERT INTO corrective_actions(task_id, instance_date, title, assignee_id, created_by_id, updated_at) VALUES (1, '2026-10-16', 'Fix panel', 1, 1, NOW())",
    );
    await expect(
      pool.query(
        "INSERT INTO corrective_actions(task_id, instance_date, title, assignee_id, created_by_id, updated_at) VALUES (1, '2026-10-16', 'Duplicate', 1, 1, NOW())",
      ),
    ).rejects.toMatchObject({ code: '23505' });
    await expect(
      pool.query(
        "INSERT INTO corrective_actions(task_id, instance_date, title, assignee_id, created_by_id, updated_at) VALUES (1, '2026-10-17', 'Invalid assignee', 9999, 1, NOW())",
      ),
    ).rejects.toMatchObject({ code: '23503' });
    await expect(
      pool.query("UPDATE corrective_actions SET state='INVALID'"),
    ).rejects.toMatchObject({ code: '23514' });
    await pool.query(
      'INSERT INTO task_evidence(id, task_id, instance_date, uploader_id, mime_type, size) VALUES ($1, 1, $2, 1, $3, 5)',
      [evidenceId, '2026-10-16', 'image/png'],
    );
  });

  it('uses real pg_dump and pg_restore to recover the database, corrective actions and private artifacts', async () => {
    for (const dir of [
      'public/uploads',
      'storage/procedures',
      'storage/evidence',
      'config',
    ])
      mkdirSync(join(root, dir), { recursive: true });
    const artifacts = {
      'public/uploads/avatar.png': 'original avatar',
      'storage/procedures/manual.txt': 'original procedure',
      [`storage/evidence/${evidenceId}`]: 'photo',
    };
    for (const [path, content] of Object.entries(artifacts))
      writeFileSync(join(root, path), content);
    writeFileSync(
      join(root, 'config/.env'),
      'TEST_SENTINEL=preserve-local-configuration',
    );
    const before = {
      users: await rows('users'),
      tasks: await rows('tasks'),
      statuses: await rows('statuses'),
      actions: await rows('corrective_actions'),
      evidence: await rows('task_evidence'),
    };
    const snapshot = await backup.createSystemSnapshot('FULL');
    expect((await backup.validateBackup(snapshot.filename)).isValid).toBe(true);
    await pool.query(
      "UPDATE tasks SET name='Changed after backup'; UPDATE corrective_actions SET state='CLOSED'; DELETE FROM task_evidence;",
    );
    for (const path of Object.keys(artifacts))
      writeFileSync(join(root, path), 'changed after backup');
    expect((await backup.restoreSystemSnapshot(snapshot.filename)).status).toBe(
      'success',
    );
    expect({
      users: await rows('users'),
      tasks: await rows('tasks'),
      statuses: await rows('statuses'),
      actions: await rows('corrective_actions'),
      evidence: await rows('task_evidence'),
    }).toEqual(before);
    for (const [path, content] of Object.entries(artifacts))
      expect(readFileSync(join(root, path), 'utf8')).toBe(content);
    expect(readFileSync(join(root, 'config/.env'), 'utf8')).toBe(
      'TEST_SENTINEL=preserve-local-configuration',
    );
    const next = await pool.query(
      "INSERT INTO tasks(name, description, periodicity, start_date, site_id, updated_at) VALUES ('After restore', '', 'daily', '2026-10-16', 1, NOW()) RETURNING id",
    );
    expect(next.rows[0].id).toBeGreaterThan(1);
  });
});
