import { Test, TestingModule } from '@nestjs/testing';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { BackupLogicService } from './backup.logic';
import { SettingsService } from '../settings';
import { ConfigService } from '@nestjs/config';
import { EncryptionService } from './encryption.service';

describe('BackupSecurity', () => {
  let service: BackupLogicService;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BackupLogicService,
        {
          provide: SettingsService,
          useValue: {},
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
        {
          provide: EncryptionService,
          useValue: {},
        },
      ],
    }).compile();

    service = module.get<BackupLogicService>(BackupLogicService);
    configService = module.get<ConfigService>(ConfigService);
  });

  it('should detect default encryption key', () => {
    const defaultKeys = [
      'change-me-to-a-random-hex-string',
      'your-secure-encryption-key-min-32-chars',
    ];

    for (const key of defaultKeys) {
      jest.spyOn(configService, 'get').mockReturnValue(key);
      expect(service.isEncryptionKeyDefault()).toBe(true);
    }
  });

  it('should return false for custom secure key', () => {
    jest
      .spyOn(configService, 'get')
      .mockReturnValue('secure-custom-key-1234567890-abcdef');
    expect(service.isEncryptionKeyDefault()).toBe(false);
  });

  it('should handle trimmed whitespace in key', () => {
    jest
      .spyOn(configService, 'get')
      .mockReturnValue('  change-me-to-a-random-hex-string  ');
    expect(service.isEncryptionKeyDefault()).toBe(true);
  });

  it('should detect if key is present', () => {
    jest.spyOn(configService, 'get').mockReturnValue('somekey');
    expect(service.isEncryptionKeyPresent()).toBe(true);

    jest.spyOn(configService, 'get').mockReturnValue('');
    expect(service.isEncryptionKeyPresent()).toBe(false);

    jest.spyOn(configService, 'get').mockReturnValue(null);
    expect(service.isEncryptionKeyPresent()).toBe(false);
  });

  // ── AUDIT #1 — backups must never include the runtime .env ────────
  describe('collectSystemArtifacts (AUDIT #1)', () => {
    let tmpRoot: string;
    let originalCwd: string;
    let originalEnvFile: string | undefined;

    beforeEach(() => {
      tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-sec-'));
      originalCwd = process.cwd();
      originalEnvFile = process.env.BACKUP_ENV_FILE_PATH;

      // Simulate a project root that contains a .env so we can prove the
      // backup logic refuses to copy it.
      fs.writeFileSync(
        path.join(tmpRoot, '.env'),
        'AUTH_SECRET=should-never-be-backed-up\n',
      );
      process.chdir(tmpRoot);
    });

    afterEach(() => {
      process.chdir(originalCwd);
      if (originalEnvFile === undefined) {
        delete process.env.BACKUP_ENV_FILE_PATH;
      } else {
        process.env.BACKUP_ENV_FILE_PATH = originalEnvFile;
      }
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    });

    it('does NOT copy the .env file into the snapshot directory', async () => {
      const target = fs.mkdtempSync(path.join(os.tmpdir(), 'snapshot-'));
      try {
        // Drive the private helper that previously copied .env. The other
        // collected artifacts (encryption config, settings JSON) rely on
        // PrismaService which is not wired here — we only inspect the
        // file-system side effect of the .env exclusion logic.
        try {
          await (service as any).collectSystemArtifacts(target);
        } catch {
          // Swallow Prisma-related errors triggered by the missing
          // PrismaService dependency; we only care about the file write.
        }

        const copied = fs
          .readdirSync(target, { withFileTypes: true })
          .map((e) => e.name);

        expect(copied).not.toContain('.env');
      } finally {
        fs.rmSync(target, { recursive: true, force: true });
      }
    });
  });
});
