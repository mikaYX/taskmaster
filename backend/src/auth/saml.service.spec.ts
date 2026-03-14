import { Test, TestingModule } from '@nestjs/testing';
import { SamlService } from './saml.service';
import { SettingsService } from '../settings/settings.service';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { REDIS_CLIENT } from '../common/redis/redis.module';

jest.mock('@node-saml/node-saml', () => {
  return {
    SAML: jest.fn().mockImplementation(() => {
      return {
        getAuthorizeUrlAsync: jest
          .fn()
          .mockResolvedValue(
            'https://idp.example.com/sso?SAMLRequest=mock-request',
          ),
        validatePostResponseAsync: jest.fn().mockResolvedValue({
          profile: {
            email: 'testu@example.com',
            displayName: 'Test User',
            nameID: 'provider-uid',
          },
        }),
        generateServiceProviderMetadata: jest
          .fn()
          .mockReturnValue('<md:EntityDescriptor />'),
      };
    }),
  };
});

describe('SamlService', () => {
  let service: SamlService;
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
        SamlService,
        { provide: SettingsService, useValue: settingsServiceMock },
        { provide: REDIS_CLIENT, useValue: redis },
      ],
    }).compile();

    service = module.get<SamlService>(SamlService);
    settingsService = module.get(SettingsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getSamlConfig', () => {
    it('should throw if SAML is not configured', async () => {
      settingsService.getRawValue.mockResolvedValue(null);
      await expect(service.getSamlConfig()).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should return config when settings are present', async () => {
      settingsService.getRawValue.mockImplementation((key) => {
        if (key === 'auth.generic.saml.entityId')
          return Promise.resolve('sp-entity');
        if (key === 'auth.generic.saml.ssoUrl')
          return Promise.resolve('http://idp.com');
        if (key === 'auth.generic.saml.x509')
          return Promise.resolve('cert-content');
        return Promise.resolve(null);
      });

      const config = await service.getSamlConfig();
      expect(config.issuer).toBe('sp-entity');
      expect(config.entryPoint).toBe('http://idp.com');
      expect(config.idpCert).toBe('cert-content');
      expect(config.wantAssertionsSigned).toBe(true);
    });
  });

  describe('getSpMetadata', () => {
    it('should generate valid metadata XML', async () => {
      settingsService.getRawValue.mockImplementation((key) => {
        if (key === 'auth.generic.saml.entityId')
          return Promise.resolve('sp-entity');
        if (key === 'auth.generic.saml.ssoUrl')
          return Promise.resolve('http://idp.com');
        if (key === 'auth.generic.saml.x509') return Promise.resolve('cert');
        return Promise.resolve(null);
      });

      const md = await service.getSpMetadata();
      expect(md).toBe('<md:EntityDescriptor />');
    });
  });

  describe('getLoginUrl', () => {
    it('should generate URL and store state/nonce in Redis if relayState provided', async () => {
      settingsService.getRawValue.mockImplementation((key) => {
        if (key === 'auth.generic.saml.entityId')
          return Promise.resolve('sp-entity');
        if (key === 'auth.generic.saml.ssoUrl')
          return Promise.resolve('http://idp.com');
        if (key === 'auth.generic.saml.x509') return Promise.resolve('cert');
        return Promise.resolve(null);
      });

      const url = await service.getLoginUrl('custom-relay-state');
      expect(url).toBe('https://idp.example.com/sso?SAMLRequest=mock-request');

      expect(redis.set).toHaveBeenCalledTimes(1);
      const setArgs = redis.set.mock.calls[0];
      expect(setArgs[0]).toMatch(/^saml-relay-state:/);
      expect(setArgs[2]).toBe('EX');
      expect(setArgs[3]).toBe(300);
    });

    it('should generate URL without relayState', async () => {
      settingsService.getRawValue.mockImplementation((key) => {
        if (key === 'auth.generic.saml.entityId')
          return Promise.resolve('sp-entity');
        if (key === 'auth.generic.saml.ssoUrl')
          return Promise.resolve('http://idp.com');
        if (key === 'auth.generic.saml.x509') return Promise.resolve('cert');
        return Promise.resolve(null);
      });

      const url = await service.getLoginUrl();
      expect(url).toBe('https://idp.example.com/sso?SAMLRequest=mock-request');
      expect(redis.set).not.toHaveBeenCalled();
    });
  });

  describe('validateResponse', () => {
    const setupMockClient = () => {
      settingsService.getRawValue.mockImplementation((key: string) => {
        if (key === 'auth.generic.saml.entityId')
          return Promise.resolve('sp-entity');
        if (key === 'auth.generic.saml.ssoUrl')
          return Promise.resolve('http://idp.com');
        if (key === 'auth.generic.saml.x509') return Promise.resolve('cert');
        return Promise.resolve(null);
      });
    };

    it('should authenticate and extract profile successfully', async () => {
      setupMockClient();
      redis.get.mockResolvedValue('original-relay-state');

      const profile = await service.validateResponse(
        'dummy-response',
        'state-id',
      );

      expect(profile.email).toBe('testu@example.com');
      expect(profile.fullname).toBe('Test User');
      expect(profile.username).toBe('testu');
    });

    it('should throw UnauthorizedException on validation failure', async () => {
      setupMockClient();
      jest.spyOn(service, 'getSamlInstance').mockResolvedValueOnce({
        validatePostResponseAsync: jest
          .fn()
          .mockRejectedValue(new Error('Signature invalid')),
      } as any);

      await expect(
        service.validateResponse('dummy-response', 'state-id'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException if no email in claims', async () => {
      setupMockClient();

      jest.spyOn(service, 'getSamlInstance').mockResolvedValueOnce({
        validatePostResponseAsync: jest.fn().mockResolvedValue({
          profile: {
            name: 'No Email',
            nameID: 'some-id',
          },
        }),
      } as any);

      await expect(service.validateResponse('dummy-response')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});
