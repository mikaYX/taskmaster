import { Test, TestingModule } from '@nestjs/testing';
import { AzureAdService } from './azure-ad.service';
import { SettingsService } from '../settings/settings.service';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { REDIS_CLIENT } from '../common/redis/redis.module';

jest.mock('@azure/msal-node', () => {
  return {
    ConfidentialClientApplication: jest.fn().mockImplementation(() => {
      return {
        getAuthCodeUrl: jest
          .fn()
          .mockResolvedValue(
            'https://login.microsoftonline.com/auth?state=mock-state',
          ),
        acquireTokenByCode: jest.fn().mockResolvedValue({
          idTokenClaims: {
            preferred_username: 'testu@example.com',
            name: 'Test User',
            oid: 'provider-uid',
          },
        }),
      };
    }),
    LogLevel: {
      Error: 0,
      Warning: 1,
      Info: 2,
      Verbose: 3,
    },
  };
});

describe('AzureAdService', () => {
  let service: AzureAdService;
  let settingsService: jest.Mocked<SettingsService>;
  let redis: Record<string, jest.Mock>;

  beforeEach(async () => {
    const settingsServiceMock = {
      getRawValue: jest.fn(),
    };

    redis = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AzureAdService,
        { provide: SettingsService, useValue: settingsServiceMock },
        { provide: REDIS_CLIENT, useValue: redis },
      ],
    }).compile();

    service = module.get<AzureAdService>(AzureAdService);
    settingsService = module.get(SettingsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getClient', () => {
    it('should throw if azure ad is disabled', async () => {
      settingsService.getRawValue.mockResolvedValueOnce('false');
      await expect(service.getClient()).rejects.toThrow(BadRequestException);
    });

    it('should configure MSAL client with settings', async () => {
      settingsService.getRawValue.mockResolvedValueOnce('true');
      settingsService.getRawValue.mockResolvedValueOnce('mock-tenant-id');
      settingsService.getRawValue.mockResolvedValueOnce('mock-client-id');
      settingsService.getRawValue.mockResolvedValueOnce('mock-client-secret');

      const client = await service.getClient();
      expect(client).toBeDefined();
      expect(settingsService.getRawValue).toHaveBeenCalledTimes(4);
    });
  });

  describe('getLoginUrl', () => {
    it('should generate URL and store state/nonce in Redis', async () => {
      settingsService.getRawValue.mockResolvedValueOnce('true');
      settingsService.getRawValue.mockResolvedValueOnce('mock-tenant-id');
      settingsService.getRawValue.mockResolvedValueOnce('mock-client-id');
      settingsService.getRawValue.mockResolvedValueOnce('mock-client-secret');

      const url = await service.getLoginUrl('http://localhost/cb');
      expect(url).toBe(
        'https://login.microsoftonline.com/auth?state=mock-state',
      );

      expect(redis.set).toHaveBeenCalledTimes(1);
      const setArgs = redis.set.mock.calls[0];
      expect(setArgs[0]).toMatch(/^azure-state:/);
      expect(setArgs[2]).toBe('EX');
      expect(setArgs[3]).toBe(300);
    });
  });

  describe('handleCallback', () => {
    const setupMockClient = () => {
      settingsService.getRawValue.mockImplementation((key: string) => {
        if (key === 'auth.azureAd.enabled') return Promise.resolve('true');
        if (key === 'auth.azureAd.tenantId')
          return Promise.resolve('tenant-123');
        if (key === 'auth.azureAd.clientId')
          return Promise.resolve('client-123');
        if (key === 'auth.azureAd.clientSecret')
          return Promise.resolve('secret-123');
        return Promise.resolve(null);
      });
    };

    it('should throw if state is missing in params', async () => {
      await expect(
        service.handleCallback('dummy-code', '', 'http://localhost/cb'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw if state not found in Redis', async () => {
      redis.get.mockResolvedValue(null);
      await expect(
        service.handleCallback(
          'dummy-code',
          'invalid-state',
          'http://localhost/cb',
        ),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should authenticate and extract profile successfully', async () => {
      setupMockClient();
      redis.get.mockResolvedValue(
        JSON.stringify({
          nonce: 'real-nonce',
          redirectUri: 'http://localhost/cb',
        }),
      );

      const profile = await service.handleCallback(
        'dummy-code',
        'real-state',
        'http://localhost/cb',
      );

      expect(redis.get).toHaveBeenCalledWith('azure-state:real-state');
      expect(redis.del).toHaveBeenCalledWith('azure-state:real-state');
      expect(profile.email).toBe('testu@example.com');
      expect(profile.fullname).toBe('Test User');
      expect(profile.username).toBe('testu');
    });

    it('should throw UnauthorizedException if no email in claims', async () => {
      setupMockClient();
      redis.get.mockResolvedValue(
        JSON.stringify({
          nonce: 'real-nonce',
          redirectUri: 'http://localhost/cb',
        }),
      );

      jest.spyOn(service, 'getClient').mockResolvedValueOnce({
        acquireTokenByCode: jest.fn().mockResolvedValue({
          idTokenClaims: {
            name: 'No Email',
            oid: 'some-id',
          },
        }),
      } as any);

      await expect(
        service.handleCallback(
          'dummy-code',
          'real-state',
          'http://localhost/cb',
        ),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
