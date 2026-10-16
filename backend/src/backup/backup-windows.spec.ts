import { ConfigService } from '@nestjs/config';
import { EventEmitter } from 'events';
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  writeSync,
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { PassThrough } from 'stream';
import { spawn, SpawnOptions } from 'child_process';
import { BackupLogicService } from './backup.logic';
import { EncryptionService } from './encryption.service';
import { SettingsService } from '../settings';

jest.mock('child_process', () => ({ spawn: jest.fn() }));

type Internals = {
  dumpDatabase(dir: string): Promise<void>;
  restoreDatabase(path: string): Promise<void>;
  getStoragePath(): Promise<string>;
};

describe('Windows service backups', () => {
  let root: string;
  let service: BackupLogicService;
  let internal: Internals;
  let originalEnv: NodeJS.ProcessEnv;
  const platform = Object.getOwnPropertyDescriptor(process, 'platform')!;
  const spawnMock = spawn as jest.MockedFunction<typeof spawn>;
  const databaseUrl =
    'postgresql://agent%40site:p%40ss%25%26word@localhost:5433/task%20master?schema=public&sslmode=require';

  beforeEach(() => {
    originalEnv = { ...process.env };
    root = mkdtempSync(join(tmpdir(), 'taskmaster service '));
    process.env.TASKMASTER_DATA_DIR = join(root, 'ProgramData');
    process.env.PG_BIN_PATH = join(root, 'Program Files', 'PostgreSQL', 'bin');
    Object.defineProperty(process, 'platform', { value: 'win32' });
    const config = {
      get: (key: string) => (key === 'DATABASE_URL' ? databaseUrl : undefined),
    } as ConfigService;
    const settings = {
      getRawValue: jest.fn().mockResolvedValue('./backups'),
    } as unknown as SettingsService;
    service = new BackupLogicService(config, settings, {} as EncryptionService);
    internal = service as unknown as Internals;
    spawnMock.mockReset();
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', platform);
    process.env = originalEnv;
    rmSync(root, { recursive: true, force: true });
  });

  function simulateProcess(
    action: (
      binary: string,
      args: readonly string[],
      options: SpawnOptions,
    ) => void,
  ) {
    spawnMock.mockImplementation(((
      binary: string,
      args: readonly string[],
      options: SpawnOptions,
    ) => {
      const child = new EventEmitter() as EventEmitter & {
        stderr: PassThrough;
      };
      child.stderr = new PassThrough();
      process.nextTick(() => {
        try {
          action(binary, args, options);
          child.emit('close', 0, null);
        } catch (error) {
          child.emit('error', error);
          child.emit('close', -1, null);
        }
      });
      return child;
    }) as typeof spawn);
  }

  it('resolves relative backup settings against the writable data root', async () => {
    await expect(internal.getStoragePath()).resolves.toBe(
      join(root, 'ProgramData', 'backups'),
    );
  });

  it('uses the configured executable without a shell and decodes connection credentials', async () => {
    simulateProcess((_binary, args) =>
      writeFileSync(args[args.indexOf('--file') + 1], 'PGDMP'),
    );
    await internal.dumpDatabase(root);
    expect(spawnMock).toHaveBeenCalledWith(
      join(process.env.PG_BIN_PATH!, 'pg_dump.exe'),
      ['--format=c', '--file', join(root, 'db.dump')],
      expect.objectContaining({
        windowsHide: true,
        env: expect.objectContaining({
          PGUSER: 'agent@site',
          PGPASSWORD: 'p@ss%&word',
          PGDATABASE: 'task master',
          PGPORT: '5433',
          PGSSLMODE: 'require',
        }),
      }),
    );
    expect(readFileSync(join(root, 'db.dump'), 'utf8')).toBe('PGDMP');
    expect(spawnMock.mock.calls[0][2]).not.toHaveProperty('shell');
  });

  it('preserves binary Docker dump bytes and keeps the password out of arguments', async () => {
    const dump = Buffer.from([
      0x50, 0x47, 0x44, 0x4d, 0x50, 0, 255, 128, 10, 13,
    ]);
    simulateProcess((binary, args, options) => {
      if (binary !== 'docker')
        throw Object.assign(new Error('not found'), { code: 'ENOENT' });
      expect(args).toContain('PGPASSWORD');
      expect(args.join(' ')).not.toContain('p@ss%&word');
      writeSync((options.stdio as Array<number | string>)[1] as number, dump);
    });
    await internal.dumpDatabase(root);
    expect(readFileSync(join(root, 'db.dump'))).toEqual(dump);
  });

  it('reports missing tools with actionable configuration guidance', async () => {
    simulateProcess(() => {
      throw Object.assign(new Error('not found'), { code: 'ENOENT' });
    });
    await expect(internal.dumpDatabase(root)).rejects.toThrow(
      'Check PG_BIN_PATH',
    );
  });

  it('redacts connection secrets from database errors', async () => {
    simulateProcess(() => {
      throw new Error(`password p@ss%&word: ${databaseUrl}`);
    });
    await expect(internal.dumpDatabase(root)).rejects.toThrow(
      'pg_dump failed: password ****: ****',
    );
  });

  it('rejects a successful process that produces an empty dump', async () => {
    simulateProcess((_binary, args) =>
      writeFileSync(args[args.indexOf('--file') + 1], ''),
    );
    await expect(internal.dumpDatabase(root)).rejects.toThrow(
      'empty database dump',
    );
  });

  it('uses the same PostgreSQL bin directory for restore without a connection URL in argv', async () => {
    simulateProcess(() => undefined);
    const dump = join(root, 'restore dump');
    await internal.restoreDatabase(dump);
    expect(spawnMock).toHaveBeenCalledWith(
      join(process.env.PG_BIN_PATH!, 'pg_restore.exe'),
      [
        '--clean',
        '--if-exists',
        '--no-owner',
        '--exit-on-error',
        '--dbname',
        'task master',
        dump,
      ],
      expect.objectContaining({
        env: expect.objectContaining({ PGPASSWORD: 'p@ss%&word' }),
      }),
    );
  });
});
