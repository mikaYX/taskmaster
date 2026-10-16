import { ConfigService } from '@nestjs/config';
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
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

describe('Encrypted snapshot round trip', () => {
  let root: string;
  let previousRoot: string | undefined;
  let service: BackupLogicService;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'taskmaster snapshot '));
    previousRoot = process.env.TASKMASTER_DATA_DIR;
    process.env.TASKMASTER_DATA_DIR = root;
    const config = {
      get: (key: string) =>
        key === 'BACKUP_ENCRYPTION_KEY'
          ? 'snapshot-test-key-not-a-real-secret'
          : undefined,
    } as ConfigService;
    service = new BackupLogicService(
      config,
      {
        getRawValue: jest.fn().mockResolvedValue(null),
      } as unknown as SettingsService,
      new EncryptionService(config),
    );
    const internal = service as unknown as {
      dumpDatabase(dir: string): Promise<void>;
    };
    jest
      .spyOn(internal, 'dumpDatabase')
      .mockImplementation(async (dir: string) => {
        writeFileSync(join(dir, 'db.dump'), 'PGDMP test fixture');
      });
  });

  afterEach(() => {
    if (previousRoot === undefined) delete process.env.TASKMASTER_DATA_DIR;
    else process.env.TASKMASTER_DATA_DIR = previousRoot;
    rmSync(root, { recursive: true, force: true });
    jest.restoreAllMocks();
  });

  it('creates, signs, decrypts and validates a real archive in a directory with spaces', async () => {
    const snapshot = await service.createSystemSnapshot('DB');
    const validation = await service.validateBackup(snapshot.filename);
    expect(validation.isValid).toBe(true);
    expect(validation.manifest.type).toBe('DB');
    expect(readdirSync(join(root, 'backups', 'system'))).toEqual([
      snapshot.filename,
    ]);
    expect(readFileSync(snapshot.path).subarray(-8).toString()).toBe(
      '##HMAC##',
    );
  });

  it('preserves a completed snapshot when retention cleanup fails', async () => {
    jest
      .spyOn(service, 'cleanupExpired')
      .mockRejectedValue(new Error('file is in use'));
    const snapshot = await service.createSystemSnapshot('DB');
    expect(existsSync(snapshot.path)).toBe(true);
    expect((await service.validateBackup(snapshot.filename)).isValid).toBe(
      true,
    );
  });

  it('removes partial files after an archive failure', async () => {
    const internal = service as unknown as {
      archiveAndEncrypt(source: string, destination: string): Promise<void>;
    };
    jest
      .spyOn(internal, 'archiveAndEncrypt')
      .mockImplementation(async (_source, destination) => {
        writeFileSync(destination, 'incomplete');
        throw new Error('disk full');
      });
    await expect(service.createSystemSnapshot('DB')).rejects.toThrow(
      'disk full',
    );
    expect(await service.listBackups()).toEqual([]);
    expect(readdirSync(join(root, 'backups', 'system'))).toEqual([]);
  });

  it('includes uploads and procedures from the data root in a FULL snapshot', async () => {
    mkdirSync(join(root, 'public', 'uploads'), { recursive: true });
    mkdirSync(join(root, 'storage', 'procedures'), { recursive: true });
    mkdirSync(join(root, 'storage', 'evidence'), { recursive: true });
    writeFileSync(
      join(root, 'storage', 'evidence', 'photo.bin'),
      'photo evidence',
    );
    writeFileSync(join(root, 'public', 'uploads', 'image.txt'), 'upload');
    writeFileSync(
      join(root, 'storage', 'procedures', 'procedure.txt'),
      'procedure',
    );
    writeFileSync(join(root, '.env'), 'SECRET=never included');
    const snapshot = await service.createSystemSnapshot('FULL');
    const extracted = join(root, 'extracted');
    mkdirSync(extracted);
    const internal = service as unknown as {
      decryptAndExtract(
        input: string,
        output: string,
        key?: string,
        file?: string,
        signed?: boolean,
      ): Promise<void>;
    };
    await internal.decryptAndExtract(
      snapshot.path,
      extracted,
      undefined,
      undefined,
      true,
    );
    expect(readFileSync(join(extracted, 'uploads', 'image.txt'), 'utf8')).toBe(
      'upload',
    );
    expect(
      readFileSync(join(extracted, 'procedures', 'procedure.txt'), 'utf8'),
    ).toBe('procedure');
    expect(existsSync(join(extracted, '.env'))).toBe(false);
    expect(readFileSync(join(extracted, 'evidence', 'photo.bin'), 'utf8')).toBe(
      'photo evidence',
    );
    const restore = service as unknown as {
      restoreDatabase(path: string): Promise<void>;
    };
    const databaseRestore = jest
      .spyOn(restore, 'restoreDatabase')
      .mockResolvedValue(undefined);
    writeFileSync(join(root, 'public', 'uploads', 'image.txt'), 'modified');
    writeFileSync(
      join(root, 'storage', 'procedures', 'procedure.txt'),
      'modified',
    );
    writeFileSync(join(root, 'storage', 'evidence', 'photo.bin'), 'modified');
    await service.restoreSystemSnapshot(snapshot.filename);
    expect(databaseRestore).toHaveBeenCalledTimes(1);
    expect(
      readFileSync(join(root, 'storage', 'evidence', 'photo.bin'), 'utf8'),
    ).toBe('photo evidence');
    expect(
      readFileSync(join(root, 'public', 'uploads', 'image.txt'), 'utf8'),
    ).toBe('upload');
    expect(
      readFileSync(
        join(root, 'storage', 'procedures', 'procedure.txt'),
        'utf8',
      ),
    ).toBe('procedure');
  });
  it.each(['missing', 'empty'])(
    'rejects a signed archive with a %s database before changing files',
    async (kind) => {
      const internal = service as unknown as {
        dumpDatabase(dir: string): Promise<void>;
        restoreDatabase(path: string): Promise<void>;
      };
      jest.spyOn(internal, 'dumpDatabase').mockImplementation(async (dir) => {
        if (kind === 'empty') writeFileSync(join(dir, 'db.dump'), '');
      });
      const uploads = join(root, 'public/uploads');
      mkdirSync(uploads, { recursive: true });
      writeFileSync(join(uploads, 'sentinel.txt'), 'snapshot value');
      const snapshot = await service.createSystemSnapshot('FULL');
      writeFileSync(join(uploads, 'sentinel.txt'), 'keep current value');
      const restore = jest
        .spyOn(internal, 'restoreDatabase')
        .mockResolvedValue(undefined);
      expect(await service.validateBackup(snapshot.filename)).toMatchObject({
        isValid: false,
      });
      await expect(
        service.restoreSystemSnapshot(snapshot.filename),
      ).rejects.toThrow('Missing or empty db.dump');
      expect(restore).not.toHaveBeenCalled();
      expect(readFileSync(join(uploads, 'sentinel.txt'), 'utf8')).toBe(
        'keep current value',
      );
    },
  );
});
