import { Test, TestingModule } from '@nestjs/testing';
import { OidcService } from './oidc.service';
import { SettingsService } from '../settings/settings.service';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { Issuer, generators } from 'openid-client';
import { REDIS_CLIENT } from '../common/redis/redis.module';

jest.mock('openid-client', () => {
  return {
    Issuer: {
      discover: jest.fn(),
    },
    generators: {
      state: jest.fn().mockReturnValue('mock-state'),
      nonce: jest.fn().mockReturnValue('mock-nonce'),
    },
  };
});

describe('OidcService', () => {
  let service: OidcService;
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
        OidcService,
        { provide: SettingsService, useValue: settingsServiceMock },
        { provide: REDIS_CLIENT, useValue: redis },
      ],
    }).compile();

    service = module.get<OidcService>(OidcService);
    settingsService = module.get(SettingsService);

    (service as any).cachedClients = {};
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getClient', () => {
    it('should configure and return generic client', async () => {
      settingsService.getRawValue.mockResolvedValueOnce('true');
      settingsService.getRawValue.mockResolvedValueOnce('https://issuer.com');
      settingsService.getRawValue.mockResolvedValueOnce('clientId');
      settingsService.getRawValue.mockResolvedValueOnce('clientSecret');

      const mockClientInstance = { authorizationUrl: jest.fn() };
      const MockClientClass = jest
        .fn()
        .mockImplementation(() => mockClientInstance);
      (Issuer.discover as jest.Mock).mockResolvedValue({
        Client: MockClientClass,
      });

      const client = await service.getClient('generic');

      expect(settingsService.getRawValue).toHaveBeenCalledTimes(4);
      expect(Issuer.discover).toHaveBeenCalledWith('https://issuer.com');
      expect(client).toBe(mockClientInstance);
    });

    it('should throw if generic is disabled', async () => {
      settingsService.getRawValue.mockResolvedValueOnce('false');
      await expect(service.getClient('generic')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw for unknown provider', async () => {
      await expect(service.getClient('unknown')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should return cached client if config unchanged', async () => {
      settingsService.getRawValue.mockResolvedValueOnce('true');
      settingsService.getRawValue.mockResolvedValueOnce('https://issuer.com');
      settingsService.getRawValue.mockResolvedValueOnce('clientId');
      settingsService.getRawValue.mockResolvedValueOnce('clientSecret');

      const mockClientInstance = { authorizationUrl: jest.fn() };
      (Issuer.discover as jest.Mock).mockResolvedValue({
        Client: jest.fn().mockImplementation(() => mockClientInstance),
      });

      await service.getClient('generic');

      settingsService.getRawValue.mockResolvedValueOnce('true');
      settingsService.getRawValue.mockResolvedValueOnce('https://issuer.com');
      settingsService.getRawValue.mockResolvedValueOnce('clientId');
      settingsService.getRawValue.mockResolvedValueOnce('clientSecret');

      const client2 = await service.getClient('generic');
      // Issuer.discover should only be called once (cached)
      expect(Issuer.discover).toHaveBeenCalledTimes(1);
      expect(client2).toBe(mockClientInstance);
    });

    it('should rebuild client if config changes (cache invalidation)', async () => {
      settingsService.getRawValue.mockResolvedValueOnce('true');
      settingsService.getRawValue.mockResolvedValueOnce('https://issuer.com');
      settingsService.getRawValue.mockResolvedValueOnce('clientId');
      settingsService.getRawValue.mockResolvedValueOnce('clientSecret');

      const mockClient1 = { authorizationUrl: jest.fn() };
      (Issuer.discover as jest.Mock).mockResolvedValue({
        Client: jest.fn().mockImplementation(() => mockClient1),
      });

      await service.getClient('generic');

      // Config changed: different clientId
      settingsService.getRawValue.mockResolvedValueOnce('true');
      settingsService.getRawValue.mockResolvedValueOnce('https://issuer.com');
      settingsService.getRawValue.mockResolvedValueOnce('newClientId');
      settingsService.getRawValue.mockResolvedValueOnce('clientSecret');

      const mockClient2 = { authorizationUrl: jest.fn() };
      (Issuer.discover as jest.Mock).mockResolvedValue({
        Client: jest.fn().mockImplementation(() => mockClient2),
      });

      const client2 = await service.getClient('generic');
      expect(Issuer.discover).toHaveBeenCalledTimes(2);
      expect(client2).toBe(mockClient2);
    });

    it('should configure and return google client', async () => {
      settingsService.getRawValue.mockImplementation((key: string) => {
        if (key === 'auth.google.enabled') return Promise.resolve('true');
        if (key === 'auth.google.clientId')
          return Promise.resolve('googleClientId');
        if (key === 'auth.google.clientSecret')
          return Promise.resolve('googleSecret');
        return Promise.resolve(null);
      });

      const mockClientInstance = { authorizationUrl: jest.fn() };
      const MockClientClass = jest
        .fn()
        .mockImplementation(() => mockClientInstance);
      (Issuer.discover as jest.Mock).mockResolvedValue({
        Client: MockClientClass,
      });

      const client = await service.getClient('google');

      expect(settingsService.getRawValue).toHaveBeenCalledWith(
        'auth.google.enabled',
      );
      expect(Issuer.discover).toHaveBeenCalledWith(
        'https://accounts.google.com',
      );
      expect(client).toBe(mockClientInstance);
    });

    it('should throw if google is disabled', async () => {
      settingsService.getRawValue.mockImplementation((key: string) => {
        if (key === 'auth.google.enabled') return Promise.resolve('false');
        return Promise.resolve(null);
      });
      await expect(service.getClient('google')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('getLoginUrl', () => {
    it('should generate state+nonce and store in Redis', async () => {
      settingsService.getRawValue.mockResolvedValueOnce('true');
      settingsService.getRawValue.mockResolvedValueOnce('https://issuer.com');
      settingsService.getRawValue.mockResolvedValueOnce('clientId');
      settingsService.getRawValue.mockResolvedValueOnce('clientSecret');
      settingsService.getRawValue.mockResolvedValueOnce('openid email');

      const mockClientInstance = {
        authorizationUrl: jest
          .fn()
          .mockReturnValue('https://issuer.com/auth?state=mock-state'),
      };
      (Issuer.discover as jest.Mock).mockResolvedValue({
        Client: jest.fn().mockImplementation(() => mockClientInstance),
      });

      const url = await service.getLoginUrl('generic', 'http://localhost/cb');

      expect(url).toBe('https://issuer.com/auth?state=mock-state');
      expect(generators.state).toHaveBeenCalled();
      expect(generators.nonce).toHaveBeenCalled();
      expect(redis.set).toHaveBeenCalledWith(
        'oidc:state:mock-state',
        JSON.stringify({
          nonce: 'mock-nonce',
          redirectUri: 'http://localhost/cb',
        }),
        'EX',
        300,
      );
      expect(mockClientInstance.authorizationUrl).toHaveBeenCalledWith({
        scope: 'openid email',
        redirect_uri: 'http://localhost/cb',
        state: 'mock-state',
        nonce: 'mock-nonce',
      });
    });

    it('should include hd parameter for google if configured', async () => {
      settingsService.getRawValue.mockImplementation((key: string) => {
        if (key === 'auth.google.enabled') return Promise.resolve('true');
        if (key === 'auth.google.clientId')
          return Promise.resolve('googleClientId');
        if (key === 'auth.google.clientSecret')
          return Promise.resolve('googleSecret');
        if (key === 'auth.google.hostedDomain')
          return Promise.resolve('example.com');
        return Promise.resolve(null);
      });

      const mockClientInstance = {
        authorizationUrl: jest
          .fn()
          .mockReturnValue('https://accounts.google.com/auth'),
      };
      (Issuer.discover as jest.Mock).mockResolvedValue({
        Client: jest.fn().mockImplementation(() => mockClientInstance),
      });

      await service.getLoginUrl('google', 'http://localhost/cb');

      expect(mockClientInstance.authorizationUrl).toHaveBeenCalledWith({
        scope: 'openid email profile',
        redirect_uri: 'http://localhost/cb',
        state: 'mock-state',
        nonce: 'mock-nonce',
        hd: 'example.com',
      });
    });
  });

  describe('handleCallback', () => {
    const setupMockClient = () => {
      settingsService.getRawValue.mockResolvedValueOnce('true');
      settingsService.getRawValue.mockResolvedValueOnce('https://issuer.com');
      settingsService.getRawValue.mockResolvedValueOnce('clientId');
      settingsService.getRawValue.mockResolvedValueOnce('clientSecret');
    };

    it('should verify state+nonce and return normalized profile', async () => {
      setupMockClient();

      const mockTokenSet = {
        claims: () => ({
          email: 'test@example.com',
          preferred_username: ' TestU ',
          name: 'Test User',
        }),
      };
      const mockClientInstance = {
        callbackParams: jest
          .fn()
          .mockReturnValue({ code: 'abc', state: 'real-state' }),
        callback: jest.fn().mockResolvedValue(mockTokenSet),
      };
      (Issuer.discover as jest.Mock).mockResolvedValue({
        Client: jest.fn().mockImplementation(() => mockClientInstance),
      });

      redis.get.mockResolvedValue(
        JSON.stringify({
          nonce: 'real-nonce',
          redirectUri: 'http://localhost/cb',
        }),
      );

      const profile = await service.handleCallback(
        'generic',
        'http://localhost/cb',
        'http://full?code=abc&state=real-state',
      );

      expect(redis.get).toHaveBeenCalledWith('oidc:state:real-state');
      expect(redis.del).toHaveBeenCalledWith('oidc:state:real-state');
      expect(mockClientInstance.callback).toHaveBeenCalledWith(
        'http://localhost/cb',
        { code: 'abc', state: 'real-state' },
        { state: 'real-state', nonce: 'real-nonce' },
      );
      // Username should be trimmed + lowercased
      expect(profile.username).toBe('testu');
      expect(profile.email).toBe('test@example.com');
    });

    it('should throw if state is missing from params', async () => {
      setupMockClient();

      const mockClientInstance = {
        callbackParams: jest.fn().mockReturnValue({ code: 'abc' }),
      };
      (Issuer.discover as jest.Mock).mockResolvedValue({
        Client: jest.fn().mockImplementation(() => mockClientInstance),
      });

      await expect(
        service.handleCallback(
          'generic',
          'http://localhost/cb',
          'http://full?code=abc',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw if state not found in Redis (expired/replayed)', async () => {
      setupMockClient();

      const mockClientInstance = {
        callbackParams: jest
          .fn()
          .mockReturnValue({ code: 'abc', state: 'expired-state' }),
      };
      (Issuer.discover as jest.Mock).mockResolvedValue({
        Client: jest.fn().mockImplementation(() => mockClientInstance),
      });

      redis.get.mockResolvedValue(null);

      await expect(
        service.handleCallback(
          'generic',
          'http://localhost/cb',
          'http://full?code=abc&state=expired-state',
        ),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException if no email in token', async () => {
      setupMockClient();

      const mockTokenSet = { claims: () => ({ name: 'No Email' }) };
      const mockClientInstance = {
        callbackParams: jest.fn().mockReturnValue({ code: 'xyz', state: 's1' }),
        callback: jest.fn().mockResolvedValue(mockTokenSet),
      };
      (Issuer.discover as jest.Mock).mockResolvedValue({
        Client: jest.fn().mockImplementation(() => mockClientInstance),
      });

      redis.get.mockResolvedValue(
        JSON.stringify({ nonce: 'n1', redirectUri: 'http://localhost/cb' }),
      );

      await expect(
        service.handleCallback(
          'generic',
          'http://localhost/cb',
          'http://full?code=xyz&state=s1',
        ),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException if email_verified is explicitly false', async () => {
      setupMockClient();

      const mockTokenSet = {
        claims: () => ({ email: 'test@example.com', email_verified: false }),
      };
      const mockClientInstance = {
        callbackParams: jest.fn().mockReturnValue({ code: 'xyz', state: 's1' }),
        callback: jest.fn().mockResolvedValue(mockTokenSet),
      };
      (Issuer.discover as jest.Mock).mockResolvedValue({
        Client: jest.fn().mockImplementation(() => mockClientInstance),
      });

      redis.get.mockResolvedValue(
        JSON.stringify({ nonce: 'n1', redirectUri: 'http://localhost/cb' }),
      );

      await expect(
        service.handleCallback(
          'generic',
          'http://localhost/cb',
          'http://full?code=xyz&state=s1',
        ),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should authenticate if email_verified is explicitly true', async () => {
      setupMockClient();

      const mockTokenSet = {
        claims: () => ({
          email: 'test@example.com',
          email_verified: true,
          name: 'True User',
        }),
      };
      const mockClientInstance = {
        callbackParams: jest.fn().mockReturnValue({ code: 'xyz', state: 's1' }),
        callback: jest.fn().mockResolvedValue(mockTokenSet),
      };
      (Issuer.discover as jest.Mock).mockResolvedValue({
        Client: jest.fn().mockImplementation(() => mockClientInstance),
      });

      redis.get.mockResolvedValue(
        JSON.stringify({ nonce: 'n1', redirectUri: 'http://localhost/cb' }),
      );

      const result = await service.handleCallback(
        'generic',
        'http://localhost/cb',
        'http://full?code=xyz&state=s1',
      );
      expect(result).toEqual({
        email: 'test@example.com',
        username: 'test',
        fullname: 'True User',
      });
    });

    it('should authenticate if email_verified is absent', async () => {
      setupMockClient();

      const mockTokenSet = {
        claims: () => ({ email: 'test@example.com', name: 'Absent User' }),
      };
      const mockClientInstance = {
        callbackParams: jest.fn().mockReturnValue({ code: 'xyz', state: 's1' }),
        callback: jest.fn().mockResolvedValue(mockTokenSet),
      };
      (Issuer.discover as jest.Mock).mockResolvedValue({
        Client: jest.fn().mockImplementation(() => mockClientInstance),
      });

      redis.get.mockResolvedValue(
        JSON.stringify({ nonce: 'n1', redirectUri: 'http://localhost/cb' }),
      );

      const result = await service.handleCallback(
        'generic',
        'http://localhost/cb',
        'http://full?code=xyz&state=s1',
      );
      expect(result).toEqual({
        email: 'test@example.com',
        username: 'test',
        fullname: 'Absent User',
      });
    });

    it('should throw if redirectUri does not match stored value', async () => {
      setupMockClient();

      const mockClientInstance = {
        callbackParams: jest
          .fn()
          .mockReturnValue({ code: 'abc', state: 'state-x' }),
      };
      (Issuer.discover as jest.Mock).mockResolvedValue({
        Client: jest.fn().mockImplementation(() => mockClientInstance),
      });

      redis.get.mockResolvedValue(
        JSON.stringify({ nonce: 'n1', redirectUri: 'http://legit-host/cb' }),
      );

      await expect(
        service.handleCallback(
          'generic',
          'http://evil-host/cb',
          'http://full?code=abc&state=state-x',
        ),
      ).rejects.toThrow(UnauthorizedException);

      // State must still be consumed (one-time)
      expect(redis.del).toHaveBeenCalledWith('oidc:state:state-x');
    });

    it('should reject google callback if hd parameter does not match', async () => {
      settingsService.getRawValue.mockImplementation((key: string) => {
        if (key === 'auth.google.enabled') return Promise.resolve('true');
        if (key === 'auth.google.clientId')
          return Promise.resolve('googleClientId');
        if (key === 'auth.google.clientSecret')
          return Promise.resolve('googleSecret');
        if (key === 'auth.google.hostedDomain')
          return Promise.resolve('example.com');
        return Promise.resolve(null);
      });

      const mockTokenSet = {
        claims: () => ({
          email: 'test@other.com',
          hd: 'other.com',
          email_verified: true,
        }),
      };
      const mockClientInstance = {
        callbackParams: jest.fn().mockReturnValue({ code: 'abc', state: 's1' }),
        callback: jest.fn().mockResolvedValue(mockTokenSet),
      };
      (Issuer.discover as jest.Mock).mockResolvedValue({
        Client: jest.fn().mockImplementation(() => mockClientInstance),
      });

      redis.get.mockResolvedValue(
        JSON.stringify({ nonce: 'n1', redirectUri: 'http://localhost/cb' }),
      );

      await expect(
        service.handleCallback(
          'google',
          'http://localhost/cb',
          'http://full?code=abc&state=s1',
        ),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('SSO ticket', () => {
    it('should create and consume a one-time ticket', async () => {
      const tokenData = {
        accessToken: 'at',
        refreshToken: 'rt',
        expiresIn: 900,
      };
      redis.set.mockResolvedValue('OK');

      const ticket = await service.createSsoTicket(tokenData);
      expect(ticket).toHaveLength(64); // 32 bytes hex
      expect(redis.set).toHaveBeenCalledWith(
        `sso_ticket:${ticket}`,
        JSON.stringify(tokenData),
        'EX',
        60,
      );
    });

    it('should consume ticket and delete from Redis', async () => {
      const tokenData = {
        accessToken: 'at',
        refreshToken: 'rt',
        expiresIn: 900,
      };
      redis.get.mockResolvedValue(JSON.stringify(tokenData));

      const result = await service.consumeSsoTicket('ticket123');

      expect(redis.get).toHaveBeenCalledWith('sso_ticket:ticket123');
      expect(redis.del).toHaveBeenCalledWith('sso_ticket:ticket123');
      expect(result).toEqual(tokenData);
    });

    it('should throw if ticket is expired/invalid', async () => {
      redis.get.mockResolvedValue(null);

      await expect(service.consumeSsoTicket('bad-ticket')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});
