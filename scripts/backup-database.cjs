#!/usr/bin/env node
// Standalone pre-update dump: works before npm ci, without application dependencies.
const fs = require('node:fs');
const path = require('node:path');
const { parseEnv } = require('node:util');
const { spawnSync } = require('node:child_process');

let backupDir;
let env = {};
try {
  const root = path.resolve(__dirname, '..');
  for (const file of ['.env', 'backend/.env']) {
    const fullPath = path.join(root, file);
    if (fs.existsSync(fullPath)) Object.assign(env, parseEnv(fs.readFileSync(fullPath, 'utf8')));
  }
  env = { ...env, ...process.env };
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required in the environment, .env or backend/.env.');
  const url = new URL(env.DATABASE_URL);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || url.pathname.length < 2) {
    throw new Error('DATABASE_URL must identify a PostgreSQL server and database.');
  }
  Object.assign(env, {
    PGHOST: url.hostname.replace(/^\[|\]$/g, ''),
    PGPORT: url.port || '5432',
    PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGCONNECT_TIMEOUT: '15',
  });
  if (url.searchParams.has('sslmode')) env.PGSSLMODE = url.searchParams.get('sslmode');

  let binary = 'pg_dump';
  if (env.PG_BIN_PATH) {
    binary = path.join(env.PG_BIN_PATH, process.platform === 'win32' ? 'pg_dump.exe' : 'pg_dump');
  } else if (process.platform === 'win32') {
    binary = 'pg_dump.exe';
    const postgresRoot = path.join(env.ProgramFiles || 'C:\\Program Files', 'PostgreSQL');
    if (fs.existsSync(postgresRoot)) {
      const versions = fs.readdirSync(postgresRoot)
        .filter(name => /^\d+(\.\d+)?$/.test(name))
        .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
      const found = versions.map(version => path.join(postgresRoot, version, 'bin', 'pg_dump.exe'))
        .find(file => fs.existsSync(file));
      if (found) binary = found;
    }
  }

  const parent = path.join(root, 'backup', 'updates');
  fs.mkdirSync(parent, { recursive: true, mode: 0o700 });
  backupDir = fs.mkdtempSync(path.join(parent, `${new Date().toISOString().replace(/[:.]/g, '-')}_`));
  if (process.platform === 'win32') {
    const identity = spawnSync('whoami.exe', ['/user', '/fo', 'csv', '/nh'], { encoding: 'utf8' });
    const sid = identity.stdout?.match(/S-1-\d+(?:-\d+)+/)?.[0];
    if (identity.error || identity.status !== 0 || !sid) throw new Error('Cannot determine the backup owner SID.');
    const acl = spawnSync('icacls.exe', [backupDir, '/inheritance:r', '/grant:r',
      `*${sid}:(OI)(CI)F`, '*S-1-5-18:(OI)(CI)F', '*S-1-5-32-544:(OI)(CI)F'], { encoding: 'utf8' });
    if (acl.error || acl.status !== 0) throw new Error('Cannot restrict access to the database backup.');
  }
  const dump = path.join(backupDir, 'database.dump');
  const result = spawnSync(binary, ['--no-password', '--format=custom', '--file', dump], {
    env, encoding: 'utf8', windowsHide: true,
  });
  if (result.error || result.status !== 0) {
    throw new Error(`pg_dump failed. Check PG_BIN_PATH, the PostgreSQL client version and database access. ${result.error?.message || result.stderr || ''}`);
  }
  const fd = fs.openSync(dump, 'r');
  const header = Buffer.alloc(5);
  try { fs.readSync(fd, header, 0, 5, 0); } finally { fs.closeSync(fd); }
  if (header.toString() !== 'PGDMP') throw new Error('pg_dump did not produce a PostgreSQL custom-format dump.');
  fs.chmodSync(dump, 0o600);
  console.log(`Database backup saved to ${dump}. Back up uploaded files separately.`);
} catch (error) {
  if (backupDir) fs.rmSync(backupDir, { recursive: true, force: true });
  let message = error.message;
  for (const secret of [env.DATABASE_URL, env.PGPASSWORD]) {
    if (secret) message = message.split(secret).join('****');
  }
  console.error(`ERROR: ${message} Update aborted.`);
  process.exitCode = 1;
}
