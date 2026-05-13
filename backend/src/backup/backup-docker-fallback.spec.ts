import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BackupLogicService } from './backup.logic';
import { SettingsService } from '../settings';
import { EncryptionService } from './encryption.service';

describe('Backup Docker fallback', () => {
  let service: BackupLogicService;
  const configGet = jest.fn();

  beforeEach(async () => {
    configGet.mockImplementation((key: string) => {
      if (key === 'BACKUP_ENCRYPTION_KEY') {
        return 'test-crypto-key-32-chars-at-least-!!!';
      }

      return undefined;
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BackupLogicService,
        {
          provide: ConfigService,
          useValue: {
            get: configGet,
          },
        },
        {
          provide: SettingsService,
          useValue: {
            getRawValue: jest.fn().mockResolvedValue(null),
          },
        },
        {
          provide: EncryptionService,
          useValue: {
            createEncryptStream: jest.fn(),
            createDecryptStream: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<BackupLogicService>(BackupLogicService);
  });

  afterEach(() => {
    configGet.mockReset();
  });

  it('should include both supported postgres container names for local backups', () => {
    const candidates = (service as any).getDockerPgDumpContainerCandidates({
      PGHOST: 'localhost',
    });

    expect(candidates).toEqual(['taskmaster_db', 'taskmaster_local_db']);
  });

  it('should prioritize configured and host-based docker containers', () => {
    configGet.mockImplementation((key: string) => {
      if (key === 'BACKUP_DOCKER_CONTAINER') {
        return 'custom_backup_db';
      }

      if (key === 'BACKUP_ENCRYPTION_KEY') {
        return 'test-crypto-key-32-chars-at-least-!!!';
      }

      return undefined;
    });

    const candidates = (service as any).getDockerPgDumpContainerCandidates({
      PGHOST: 'postgres',
    });

    expect(candidates).toEqual([
      'custom_backup_db',
      'postgres',
      'taskmaster_db',
      'taskmaster_local_db',
    ]);
  });
});