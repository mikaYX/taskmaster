import { ConfigService } from '@nestjs/config';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { BackupLogicService } from './backup.logic';
import { EncryptionService } from './encryption.service';
import { SettingsService } from '../settings';

/**
 * The backup folder (BACKUP_STORAGE_PATH) can live outside the data root, for
 * example on another drive. Everything must keep working from there.
 */
describe('Backups in a custom folder outside the data root', () => {
  let dataRoot: string;
  let customDir: string;
  let previousRoot: string | undefined;
  let service: BackupLogicService;

  beforeEach(() => {
    const base = mkdtempSync(join(tmpdir(), 'taskmaster custom '));
    dataRoot = join(base, 'ProgramData');
    customDir = join(base, 'Sauvegardes externes');
    mkdirSync(dataRoot, { recursive: true });
    previousRoot = process.env.TASKMASTER_DATA_DIR;
    process.env.TASKMASTER_DATA_DIR = dataRoot;

    const config = {
      get: (key: string) =>
        key === 'BACKUP_ENCRYPTION_KEY'
          ? 'custom-path-test-key-not-a-real-secret'
          : key === 'BACKUP_STORAGE_PATH'
            ? customDir
            : undefined,
    } as ConfigService;
    service = new BackupLogicService(
      config,
      {
        // The stored setting always has its default value.
        getRawValue: jest.fn().mockResolvedValue('./backups'),
      } as unknown as SettingsService,
      new EncryptionService(config),
    );
    jest
      .spyOn(
        service as unknown as { dumpDatabase(dir: string): Promise<void> },
        'dumpDatabase',
      )
      .mockImplementation(async (dir: string) => {
        writeFileSync(join(dir, 'db.dump'), 'PGDMP test fixture');
      });
    jest
      .spyOn(
        service as unknown as { restoreDatabase(path: string): Promise<void> },
        'restoreDatabase',
      )
      .mockResolvedValue(undefined);
  });

  afterEach(() => {
    if (previousRoot === undefined) delete process.env.TASKMASTER_DATA_DIR;
    else process.env.TASKMASTER_DATA_DIR = previousRoot;
    rmSync(join(dataRoot, '..'), { recursive: true, force: true });
    jest.restoreAllMocks();
  });

  it('writes, lists and validates archives in the custom folder only', async () => {
    const snapshot = await service.createSystemSnapshot('DB');

    expect(snapshot.path.startsWith(customDir)).toBe(true);
    expect(existsSync(join(dataRoot, 'backups', snapshot.filename))).toBe(
      false,
    );
    expect((await service.validateBackup(snapshot.filename)).isValid).toBe(
      true,
    );
    expect((await service.listBackups()).map((b) => b.filename)).toEqual([
      snapshot.filename,
    ]);
  });

  it('restores uploads, procedures and evidence from an archive stored there', async () => {
    mkdirSync(join(dataRoot, 'public', 'uploads'), { recursive: true });
    mkdirSync(join(dataRoot, 'storage', 'procedures'), { recursive: true });
    writeFileSync(join(dataRoot, 'public', 'uploads', 'a.txt'), 'original');
    writeFileSync(join(dataRoot, 'storage', 'procedures', 'p.txt'), 'original');
    const snapshot = await service.createSystemSnapshot('FULL');
    writeFileSync(join(dataRoot, 'public', 'uploads', 'a.txt'), 'changed');
    writeFileSync(join(dataRoot, 'storage', 'procedures', 'p.txt'), 'changed');

    await service.restoreSystemSnapshot(snapshot.filename);

    expect(
      readFileSync(join(dataRoot, 'public', 'uploads', 'a.txt'), 'utf8'),
    ).toBe('original');
    expect(
      readFileSync(join(dataRoot, 'storage', 'procedures', 'p.txt'), 'utf8'),
    ).toBe('original');
  });

  it('leaves no scratch folder behind after validating or restoring', async () => {
    const snapshot = await service.createSystemSnapshot('DB');

    await service.validateBackup(snapshot.filename);
    await service.restoreSystemSnapshot(snapshot.filename);

    expect(readdirSync(customDir)).toEqual([snapshot.filename]);
  });

  it('imports an uploaded archive into the custom folder even from another volume', async () => {
    const snapshot = await service.createSystemSnapshot('DB');
    const staged = join(dataRoot, 'backups', 'temp_uploads');
    mkdirSync(staged, { recursive: true });
    const uploaded = join(staged, 'upload.tmp');
    writeFileSync(uploaded, readFileSync(snapshot.path));
    rmSync(snapshot.path);

    await service.importBackup(uploaded, snapshot.filename);

    expect(existsSync(join(customDir, snapshot.filename))).toBe(true);
    expect(existsSync(uploaded)).toBe(false);
    expect((await service.validateBackup(snapshot.filename)).isValid).toBe(
      true,
    );
  });

  it('restores an archive that was only copied into the folder (new server scenario)', async () => {
    mkdirSync(join(dataRoot, 'public', 'uploads'), { recursive: true });
    writeFileSync(
      join(dataRoot, 'public', 'uploads', 'a.txt'),
      'from old server',
    );
    const snapshot = await service.createSystemSnapshot('FULL');
    const bytes = readFileSync(snapshot.path);
    rmSync(customDir, { recursive: true, force: true });
    writeFileSync(
      join(dataRoot, 'public', 'uploads', 'a.txt'),
      'empty new server',
    );

    mkdirSync(customDir, { recursive: true });
    writeFileSync(join(customDir, snapshot.filename), bytes);

    await service.restoreSystemSnapshot(snapshot.filename);
    expect(
      readFileSync(join(dataRoot, 'public', 'uploads', 'a.txt'), 'utf8'),
    ).toBe('from old server');
  });
});
