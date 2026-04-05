import { Test, TestingModule } from '@nestjs/testing';
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
});
