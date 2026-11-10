import { ConfigService } from '@nestjs/config';
import { SETTINGS_REGISTRY, SETTING_KEYS } from './settings.registry';
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
    expect(await service.getPublicBranding()).toMatchObject({
      'app.showTitle': 'false',
      'app.showSubtitle': 'true',
    });
    const keys = prisma.client.config.findMany.mock.calls[0][0].where.key.in;
    expect(keys).toEqual(
      expect.arrayContaining(['app.showTitle', 'app.showSubtitle']),
    );
    expect(
      keys.some((key: string) =>
        /secret|password|apiKey|database|privateKey/i.test(key),
      ),
    ).toBe(false);
  });

  it('falls back to registry defaults on a fresh install', async () => {
    prisma.client.config.findMany.mockResolvedValue([]);
    expect(await service.getPublicBranding()).toMatchObject({
      'app.title': 'Taskmaster',
      'app.subtitle': 'Task Management System',
      'app.showSubtitle': 'true',
    });
  });

  it.each([
    ['app.accentColor', 'red'],
    ['app.accentColor', '#fff'],
    ['app.wallpaperBlur', '50'],
    ['app.wallpaperDim', '90'],
    ['app.loginCardOpacity', '10'],
    ['app.loginMessage', 'x'.repeat(301)],
  ])('rejects an out-of-range value for %s (%s)', async (key, value) => {
    await expect(service.set(key, value)).rejects.toThrow('Invalid value for');
  });

  describe('sensitive values sent back as the mask', () => {
    it('keeps the stored secret when a form returns the mask untouched', async () => {
      prisma.client.config.findUnique.mockResolvedValue({
        key: 'email.smtp.password',
        value: 'stored',
      });

      const result = await service.set('email.smtp.password', '••••••••');

      expect(prisma.client.config.upsert).not.toHaveBeenCalled();
      expect(result.value).toBe('••••••••');
    });

    it('still stores a real new password', async () => {
      prisma.client.config.findUnique.mockResolvedValue(null);

      await service.set('email.smtp.password', 'new-secret');

      expect(prisma.client.config.upsert).toHaveBeenCalledTimes(1);
    });

    it('also ignores the mask in a bulk save of the whole e-mail page', async () => {
      prisma.client.config.findUnique.mockResolvedValue(null);

      await service.setBulk({
        'email.smtp.host': 'smtp.example.com',
        'email.smtp.password': '••••••••',
      });

      expect(prisma.client.config.upsert).toHaveBeenCalledTimes(1);
      expect(prisma.client.config.upsert.mock.calls[0][0].where.key).toBe(
        'email.smtp.host',
      );
    });
  });
});

describe('Settings persistence with real encryption and audit', () => {
  const rows = new Map<
    string,
    { key: string; value: string; updatedAt: Date }
  >();
  const config = {
    findUnique: jest.fn(
      async ({ where }: { where: { key: string } }) =>
        rows.get(where.key) ?? null,
    ),
    findMany: jest.fn(async () => [...rows.values()]),
    upsert: jest.fn(
      async ({
        create,
        update,
      }: {
        create: { key: string; value: string };
        update: { value: string };
      }) => {
        const row = {
          key: create.key,
          value: rows.has(create.key) ? update.value : create.value,
          updatedAt: new Date(),
        };
        rows.set(row.key, row);
        return row;
      },
    ),
    deleteMany: jest.fn(async ({ where }: { where: { key: string } }) => ({
      count: Number(rows.delete(where.key)),
    })),
  };
  const auditCreate = jest.fn();
  let service: SettingsService;
  beforeEach(async () => {
    rows.clear();
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        SettingsService,
        EncryptionService,
        AuditService,
        {
          provide: ConfigService,
          useValue: new ConfigService({
            AUTH_SECRET: 'test-secret-at-least-16',
          }),
        },
        {
          provide: PrismaService,
          useValue: { client: { config, auditLog: { create: auditCreate } } },
        },
      ],
    }).compile();
    service = module.get(SettingsService);
  });

  it('accepts the string true for Azure AD', async () => {
    expect((await service.set('auth.azureAd.enabled', 'true')).value).toBe(
      true,
    );
  });

  it('presents an absent secret as empty in get and getAll', async () => {
    expect((await service.get('email.smtp.password')).value).toBe('');
    expect(
      (await service.getAll()).find((row) => row.key === 'email.smtp.password')
        ?.value,
    ).toBe('');
  });

  it.each(SETTING_KEYS.filter((key) => SETTINGS_REGISTRY[key].sensitive))(
    'redacts persisted audit changes for %s',
    async (key) => {
      await service.set(key, 'first-private-value', {
        id: 1,
        username: 'admin',
      });
      await service.set(key, 'second-private-value', {
        id: 1,
        username: 'admin',
      });
      await service.reset(key, { id: 1, username: 'admin' });
      expect(auditCreate).toHaveBeenCalledTimes(3);
      const persisted = JSON.stringify(auditCreate.mock.calls);
      expect(persisted).not.toContain('first-private-value');
      expect(persisted).not.toContain('second-private-value');
      expect(persisted).toContain('[REDACTED]');
    },
  );
  it('preserves encrypted secrets when get/getAll masks are returned through set and bulk', async () => {
    await service.set('email.smtp.password', 'original-secret');
    const raw = rows.get('email.smtp.password')?.value;
    expect(raw).not.toContain('original-secret');
    const response = await service.get('email.smtp.password');
    expect(response.value).toBe('••••••••');
    expect(
      (await service.getAll()).find((row) => row.key === response.key)?.value,
    ).toBe(response.value);
    await service.set(response.key, response.value);
    await service.setBulk({ email: { smtp: { password: response.value } } });
    expect(rows.get(response.key)?.value).toBe(raw);
    expect(await service.getRawValue('email.smtp.password')).toBe(
      'original-secret',
    );
    expect(config.upsert).toHaveBeenCalledTimes(1);
  });

  it('stores an explicitly empty secret and clears its mask on reset', async () => {
    expect((await service.set('email.smtp.password', '')).value).toBe(
      '••••••••',
    );
    expect(await service.getRawValue('email.smtp.password')).toBe('');
    expect((await service.reset('email.smtp.password')).value).toBe('');
    expect(rows.has('email.smtp.password')).toBe(false);
    expect((await service.get('email.smtp.password')).value).toBe('');
  });

  it.each(['true', '"true"', 'false', '"false"'])(
    'reads legacy boolean %s',
    async (value) => {
      rows.set('email.enabled', {
        key: 'email.enabled',
        value,
        updatedAt: new Date(),
      });
      expect(await service.getRawValue('email.enabled')).toBe(
        value.includes('true'),
      );
      expect((await service.get('email.enabled')).value).toBe(
        value.includes('true'),
      );
    },
  );

  it('caches defaults and stored values, invalidates writes and reset, and expires reads', async () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(1000);
    try {
      expect(await service.getRawValue('app.title')).toBe('Taskmaster');
      expect(await service.getRawValue('app.title')).toBe('Taskmaster');
      expect(config.findUnique).toHaveBeenCalledTimes(1);
      await service.set('app.title', 'Changed');
      expect(await service.getRawValue('app.title')).toBe('Changed');
      rows.set('app.title', {
        key: 'app.title',
        value: '"External"',
        updatedAt: new Date(),
      });
      expect(await service.getRawValue('app.title')).toBe('Changed');
      now.mockReturnValue(61001);
      expect(await service.getRawValue('app.title')).toBe('External');
      expect((await service.reset('app.title')).value).toBe('Taskmaster');
      expect(await service.getRawValue('app.title')).toBe('Taskmaster');
    } finally {
      now.mockRestore();
    }
  });

  it('keeps partial bulk success, leaves rejected values unchanged and ignores unknown keys', async () => {
    await service.set('email.smtp.port', 2525);
    const results = await service.setBulk({
      email: { smtp: { port: 0 }, enabled: 'true' },
      'unknown.setting': 'ignored',
    });
    expect(results.map((row) => row.key)).toEqual(['email.enabled']);
    expect(await service.getRawValue('email.smtp.port')).toBe(2525);
    expect(await service.getRawValue('email.enabled')).toBe(true);
    expect(rows.has('unknown.setting')).toBe(false);
  });

  it('rejects arbitrary boolean strings without writing', async () => {
    await expect(service.set('auth.azureAd.enabled', 'yes')).rejects.toThrow(
      'Invalid value',
    );
    expect(config.upsert).not.toHaveBeenCalled();
  });

  it('ignores obsolete stored keys in getAll', async () => {
    rows.set('obsolete', {
      key: 'obsolete',
      value: 'invalid',
      updatedAt: new Date(),
    });
    expect((await service.getAll()).some((row) => row.key === 'obsolete')).toBe(
      false,
    );
  });
});
