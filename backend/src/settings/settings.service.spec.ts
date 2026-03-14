import { Test, TestingModule } from '@nestjs/testing';
import { SettingsService } from './settings.service';
import { PrismaService } from '../prisma';
import { EncryptionService } from './encryption.service';
import { AuditService } from '../audit/audit.service';
import { BadRequestException } from '@nestjs/common';
import { clear } from 'console';

describe('SettingsService', () => {
  let service: SettingsService;
  let prisma: any;
  let encryption: any;
  let audit: any;

  beforeEach(async () => {
    const mockPrisma = {
      client: {
        config: {
          findMany: jest.fn(),
          findUnique: jest.fn(),
          upsert: jest.fn(),
          deleteMany: jest.fn(),
        },
      },
    };
    const mockEncryption = {
      isEncrypted: jest.fn(),
      encrypt: jest.fn((val) => val),
      decrypt: jest.fn((val) => val),
    };
    const mockAudit = {
      logDiff: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SettingsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EncryptionService, useValue: mockEncryption },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();

    service = module.get<SettingsService>(SettingsService);
    prisma = module.get(PrismaService);
    encryption = module.get(EncryptionService);
    audit = module.get(AuditService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getAuthCapabilities', () => {
    it('should return correct capability map', async () => {
      // Mock DB returning values
      // For simplicity, everything is false/empty by default due to no records.
      prisma.client.config.findUnique.mockResolvedValue(null);

      const result = await service.getAuthCapabilities();
      expect(result.azure_ad.implemented).toBe(true);
      expect(result.google_workspace.implemented).toBe(true);
      expect(result.saml.implemented).toBe(true);
      expect(result.oidc_generic.implemented).toBe(true);
      expect(result.ldap.implemented).toBe(true);
    });
  });
});
