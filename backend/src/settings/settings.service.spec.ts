import { Test, TestingModule } from '@nestjs/testing';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma';
import { EncryptionService } from './encryption.service';
import { SettingsService } from './settings.service';

describe('SettingsService', () => {
  let service: SettingsService;
  let prisma: any;

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
  it('exposes display flags through the public allowlist without adding secrets', async () => {
    prisma.client.config.findMany.mockResolvedValue([
      { key: 'app.showTitle', value: '"false"' },
      { key: 'app.showSubtitle', value: '"true"' },
    ]);
    expect(await service.getPublicBranding()).toEqual({
      'app.showTitle': 'false',
      'app.showSubtitle': 'true',
    });
    const keys = prisma.client.config.findMany.mock.calls[0][0].where.key.in;
    expect(keys).toEqual(
      expect.arrayContaining(['app.showTitle', 'app.showSubtitle']),
    );
    expect(
      keys.some((key) =>
        /secret|password|apiKey|database|privateKey/i.test(key),
      ),
    ).toBe(false);
  });
});
