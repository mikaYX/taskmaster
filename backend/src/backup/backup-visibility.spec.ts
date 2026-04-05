import { Test, TestingModule } from '@nestjs/testing';
import { BackupLogicService } from './backup.logic';
import { SettingsService } from '../settings';
import { ConfigService } from '@nestjs/config';
import { EncryptionService } from './encryption.service';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';

describe('BackupVisibility (Regression)', () => {
  let service: BackupLogicService;
  let settings: SettingsService;

  const testDir1 = join(process.cwd(), 'backups_test_1');
  const testDir2 = join(process.cwd(), 'backups_test_2');

  beforeAll(() => {
    if (!existsSync(testDir1)) mkdirSync(testDir1, { recursive: true });
    if (!existsSync(testDir2)) mkdirSync(testDir2, { recursive: true });
    writeFileSync(join(testDir1, 'backup_1.tar.gz.enc'), 'test');
    writeFileSync(join(testDir2, 'backup_2.tar.gz.enc'), 'test');
  });

  afterAll(() => {
    rmSync(testDir1, { recursive: true, force: true });
    rmSync(testDir2, { recursive: true, force: true });
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BackupLogicService,
        {
          provide: SettingsService,
          useValue: {
            getRawValue: jest.fn().mockResolvedValue(null),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue(null),
          },
        },
        {
          provide: EncryptionService,
          useValue: {},
        },
      ],
    }).compile();

    service = module.get<BackupLogicService>(BackupLogicService);
    settings = module.get<SettingsService>(SettingsService);
  });

  it('should list backups from directory 1 when configured', async () => {
    jest.spyOn(settings, 'getRawValue').mockResolvedValue(testDir1);
    const backups = await service.listBackups();
    expect(backups).toHaveLength(1);
    expect(backups[0].filename).toBe('backup_1.tar.gz.enc');
  });

  it('should list backups from directory 2 when path is changed', async () => {
    jest.spyOn(settings, 'getRawValue').mockResolvedValue(testDir2);
    const backups = await service.listBackups();
    expect(backups).toHaveLength(1);
    expect(backups[0].filename).toBe('backup_2.tar.gz.enc');
  });

  it('should fallback to default if settings return null', async () => {
    // config returns null, settings returns null -> DEFAULT_BACKUP_DIR (backups/system)
    jest.spyOn(settings, 'getRawValue').mockResolvedValue(null);
    const backups = await service.listBackups();
    // Just verify it doesn't crash and returns an array
    expect(Array.isArray(backups)).toBe(true);
  });
});
