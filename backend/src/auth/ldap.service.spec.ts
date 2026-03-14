import { Test, TestingModule } from '@nestjs/testing';
import { LdapService } from './ldap.service';
import { SettingsService } from '../settings/settings.service';
import { Logger } from '@nestjs/common';
import { Client } from 'ldapts';

jest.mock('ldapts');

describe('LdapService', () => {
  let service: LdapService;
  let settingsService: jest.Mocked<SettingsService>;
  let mockClientInstance: any;

  beforeEach(async () => {
    jest.clearAllMocks();

    mockClientInstance = {
      bind: jest.fn().mockResolvedValue(undefined),
      search: jest.fn().mockResolvedValue({
        searchEntries: [
          {
            dn: 'uid=testuser,ou=users,dc=example,dc=com',
            mail: 'testuser@example.com',
            displayName: 'Test User',
          },
        ],
      }),
      unbind: jest.fn().mockResolvedValue(undefined),
    };

    (Client as jest.Mock).mockImplementation(() => mockClientInstance);

    const mockSettingsService = {
      getRawValue: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LdapService,
        {
          provide: SettingsService,
          useValue: mockSettingsService,
        },
      ],
    }).compile();

    service = module.get<LdapService>(LdapService);
    settingsService = module.get(SettingsService);

    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => {});
  });

  const setupSettings = (overrides: Record<string, string> = {}) => {
    const defaults: Record<string, string> = {
      'auth.ldap.enabled': 'true',
      'auth.ldap.url': 'ldap://localhost:389',
      'auth.ldap.bindDn': 'cn=admin,dc=example,dc=com',
      'auth.ldap.bindPassword': 'adminpassword',
      'auth.ldap.searchBase': 'ou=users,dc=example,dc=com',
      'auth.ldap.searchFilter': '(uid={{username}})',
      ...overrides,
    };

    settingsService.getRawValue.mockImplementation(
      async (key: any) => defaults[key],
    );
  };

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('authenticate()', () => {
    it('should return null if LDAP is disabled', async () => {
      setupSettings({ 'auth.ldap.enabled': 'false' });
      const result = await service.authenticate('testuser', 'password');
      expect(result).toBeNull();
      expect(mockClientInstance.bind).not.toHaveBeenCalled();
    });

    it('should return null if basic config is missing', async () => {
      setupSettings({ 'auth.ldap.url': '' });
      const result = await service.authenticate('testuser', 'password');
      expect(result).toBeNull();
      expect(mockClientInstance.bind).not.toHaveBeenCalled();
    });

    it('should return profile and bind twice on success', async () => {
      setupSettings();

      const result = await service.authenticate('testuser', 'password123');

      expect(result).toEqual({
        username: 'testuser@example.com',
        email: 'testuser@example.com',
        fullname: 'Test User',
      });

      // Original client: bind with admin credentials, then search, then unbind
      expect(mockClientInstance.bind).toHaveBeenNthCalledWith(
        1,
        'cn=admin,dc=example,dc=com',
        'adminpassword',
      );
      expect(mockClientInstance.search).toHaveBeenCalledWith(
        'ou=users,dc=example,dc=com',
        expect.any(Object),
      );

      // User client: bind with user's DN
      expect(mockClientInstance.bind).toHaveBeenNthCalledWith(
        2,
        'uid=testuser,ou=users,dc=example,dc=com',
        'password123',
      );
    });

    it('should return null if user not found during search', async () => {
      setupSettings();
      mockClientInstance.search.mockResolvedValueOnce({ searchEntries: [] });

      const result = await service.authenticate('nonexistent', 'password123');
      expect(result).toBeNull();
      expect(mockClientInstance.bind).toHaveBeenCalledTimes(1); // Only admin bind
    });

    it('should return null if user password verification fails', async () => {
      setupSettings();
      // First bind succeeds (admin). Second bind fails (user)
      mockClientInstance.bind
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('Invalid credentials'));

      const result = await service.authenticate('testuser', 'wrongpassword');
      expect(result).toBeNull();
    });

    it('should return null if connection error occurs', async () => {
      setupSettings();
      mockClientInstance.bind.mockRejectedValue(
        new Error('Connection timeout'),
      );

      const result = await service.authenticate('testuser', 'password123');
      expect(result).toBeNull();
    });
  });

  describe('testConnection()', () => {
    it('should return success true on successful connection config', async () => {
      const dto = {
        url: 'ldap://localhost',
        bindDn: 'admin',
        bindPassword: 'pass',
        searchBase: 'ou=users',
        searchFilter: '(uid={{username}})',
      };

      const result = await service.testConnection(dto);
      expect(result.success).toBe(true);
      expect(mockClientInstance.bind).toHaveBeenCalledWith('admin', 'pass');
      expect(mockClientInstance.search).toHaveBeenCalled();
    });

    it('should fallback to anonymous bind if bindDn/bindPassword not provided', async () => {
      const dto = {
        url: 'ldap://localhost',
        searchBase: 'ou=users',
      };

      const result = await service.testConnection(dto);
      expect(result.success).toBe(true);
      expect(mockClientInstance.bind).toHaveBeenCalledWith('', '');
    });

    it('should return success false when connection fails', async () => {
      const dto = {
        url: 'ldap://localhost',
        searchBase: 'ou=users',
      };

      mockClientInstance.bind.mockRejectedValue(new Error('Network error'));

      const result = await service.testConnection(dto);
      expect(result.success).toBe(false);
      expect(result.message).toBe('Network error');
    });
  });
});
