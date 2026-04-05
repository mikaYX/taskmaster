import { Test, TestingModule } from '@nestjs/testing';
import { BackupLogicService } from './backup.logic';
import { ConfigService } from '@nestjs/config';
import { SettingsService } from '../settings';
import { EncryptionService } from './encryption.service';
import {
  InternalServerErrorException,
  BadRequestException,
} from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

describe('Backup Integrity (M6)', () => {
  let service: BackupLogicService;
  let configService: ConfigService;
  const backupDir = path.join(process.cwd(), 'backups', 'test_integrity');
  const secret = 'test-crypto-key-32-chars-at-least-!!!';

  beforeAll(() => {
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
  });

  afterAll(() => {
    if (fs.existsSync(backupDir))
      fs.rmSync(backupDir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BackupLogicService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key) => {
              if (key === 'BACKUP_ENCRYPTION_KEY') return secret;
              if (key === 'BACKUP_STORAGE_PATH') return backupDir;
              return undefined;
            }),
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
            createEncryptStream: jest.fn(
              () => new (require('stream').PassThrough)(),
            ),
            createDecryptStream: jest.fn(
              () => new (require('stream').PassThrough)(),
            ),
          },
        },
      ],
    }).compile();

    service = module.get<BackupLogicService>(BackupLogicService);
    configService = module.get<ConfigService>(ConfigService);
  });

  async function createFakeBackup(
    content: string,
    hasHmac: boolean,
    key: string = secret,
  ) {
    const filename = `test_${Math.random().toString(36).substring(7)}.enc`;
    const filePath = path.join(backupDir, filename);
    fs.writeFileSync(filePath, content);

    if (hasHmac) {
      const hmac = crypto.createHmac('sha256', key);
      hmac.update(content);
      const signature = hmac.digest('hex');
      fs.appendFileSync(filePath, Buffer.from(signature + '##HMAC##', 'utf8'));
    }
    return filename;
  }

  it('should allow restore for a valid signed backup', async () => {
    const filename = await createFakeBackup('valid content', true);

    // Mock decryptAndExtract to simulate successful extraction of a manifest
    jest
      .spyOn(service as any, 'decryptAndExtract')
      .mockImplementation(async (input: string, outputDir: string) => {
        if (!fs.existsSync(outputDir))
          fs.mkdirSync(outputDir, { recursive: true });
        fs.writeFileSync(
          path.join(outputDir, 'manifest.json'),
          JSON.stringify({ appVersion: '1.0.0' }),
        );
        return Promise.resolve();
      });

    // Mock restoreDatabase to avoid actual DB connection
    jest.spyOn(service as any, 'restoreDatabase').mockResolvedValue(undefined);

    process.env.npm_package_version = '1.0.0';

    const result = await service.restoreSystemSnapshot(filename);
    expect(result.status).toBe('success');
  });

  it('should block restore if backup is tampered (invalid HMAC)', async () => {
    const filename = await createFakeBackup('tampered content', true);
    const filePath = path.join(backupDir, filename);

    // Tamper with data but keep signature/magic at the end
    const fileContent = fs.readFileSync(filePath);
    fileContent[0] = fileContent[0] ^ 0xff; // Flip bits of first byte
    fs.writeFileSync(filePath, fileContent);

    await expect(service.restoreSystemSnapshot(filename)).rejects.toThrow(
      /Security Error: Invalid HMAC signature/,
    );
  });

  it('should block restore if backup is unsigned', async () => {
    const filename = await createFakeBackup('unsigned content', false);

    await expect(service.restoreSystemSnapshot(filename)).rejects.toThrow(
      /Security Error: Backup signature is missing/,
    );
  });

  it('should block restore if verification key is different', async () => {
    const filename = await createFakeBackup(
      'content signed with other key',
      true,
      'other-secret-key-32-chars-long-!!!',
    );

    await expect(service.restoreSystemSnapshot(filename)).rejects.toThrow(
      /Security Error: Invalid HMAC signature/,
    );
  });

  it('should block restore even with force=true if signature is invalid', async () => {
    const filename = await createFakeBackup('tampered content', true);
    const filePath = path.join(backupDir, filename);
    const fileContent = fs.readFileSync(filePath);
    fileContent[1] = fileContent[1] ^ 0xff;
    fs.writeFileSync(filePath, fileContent);

    await expect(
      service.restoreSystemSnapshot(filename, { force: true }),
    ).rejects.toThrow(/Security Error: Invalid HMAC signature/);
  });
});
