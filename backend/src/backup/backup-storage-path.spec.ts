import type { ConfigService } from '@nestjs/config';
import { existsSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { BackupLogicService } from './backup.logic';
import type { EncryptionService } from './encryption.service';
import type { SettingsService } from '../settings';

describe('BackupLogicService.resolveStoragePath', () => {
  let root: string;
  let previousDataDir: string | undefined;

  const build = (envPath: string | undefined, settingPath: string | null) =>
    new BackupLogicService(
      {
        get: (key: string) =>
          key === 'BACKUP_STORAGE_PATH' ? envPath : undefined,
      } as ConfigService,
      {
        getRawValue: jest.fn().mockResolvedValue(settingPath),
      } as unknown as SettingsService,
      {} as EncryptionService,
    );

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'taskmaster storage '));
    previousDataDir = process.env.TASKMASTER_DATA_DIR;
    process.env.TASKMASTER_DATA_DIR = join(root, 'data');
  });

  afterEach(() => {
    if (previousDataDir === undefined) delete process.env.TASKMASTER_DATA_DIR;
    else process.env.TASKMASTER_DATA_DIR = previousDataDir;
    rmSync(root, { recursive: true, force: true });
  });

  it('honours BACKUP_STORAGE_PATH even though the stored setting always defaults to ./backups', async () => {
    const custom = join(root, 'elsewhere', 'backups');

    await expect(build(custom, './backups').resolveStoragePath()).resolves.toBe(
      custom,
    );
  });

  it('resolves a relative BACKUP_STORAGE_PATH against the data root', async () => {
    await expect(
      build('./saves', './backups').resolveStoragePath(),
    ).resolves.toBe(resolve(process.env.TASKMASTER_DATA_DIR!, 'saves'));
  });

  it('falls back to the stored setting when the variable is empty or blank', async () => {
    await expect(build('   ', './archives').resolveStoragePath()).resolves.toBe(
      resolve(process.env.TASKMASTER_DATA_DIR!, 'archives'),
    );
    await expect(
      build(undefined, './archives').resolveStoragePath(),
    ).resolves.toBe(resolve(process.env.TASKMASTER_DATA_DIR!, 'archives'));
  });

  it('falls back to the system backup folder when nothing is configured', async () => {
    await expect(build(undefined, null).resolveStoragePath()).resolves.toBe(
      join(process.env.TASKMASTER_DATA_DIR!, 'backups', 'system'),
    );
  });

  it('does not create the folder just to report it', async () => {
    const custom = join(root, 'not-created');

    await build(custom, './backups').resolveStoragePath();

    expect(existsSync(custom)).toBe(false);
  });
});
