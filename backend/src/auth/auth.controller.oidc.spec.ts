import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { OidcService } from './oidc.service';
import { UnauthorizedException } from '@nestjs/common';
import { AzureAdService } from './azure-ad.service';
import { SamlService } from './saml.service';
import { ConfigService } from '@nestjs/config';
import { REDIS_CLIENT } from '../common/redis/redis.module';

describe('AuthController OIDC endpoints', () => {
  let controller: AuthController;
  let oidcService: jest.Mocked<OidcService>;
  let authService: jest.Mocked<AuthService>;

  beforeEach(async () => {
    const mockOidcService = {
      getLoginUrl: jest.fn(),
      handleCallback: jest.fn(),
      createSsoTicket: jest.fn(),
      consumeSsoTicket: jest.fn(),
    };

    const mockAuthService = {
      loginOidc: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: mockAuthService },
        { provide: OidcService, useValue: mockOidcService },
        { provide: AzureAdService, useValue: {} },
        { provide: SamlService, useValue: {} },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('test') } },
        { provide: REDIS_CLIENT, useValue: {} },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    oidcService = module.get(OidcService);
    authService = module.get(AuthService);
  });

  describe('GET /auth/external/login/:provider', () => {
    it('should redirect to OIDC login URL using BACKEND_URL', async () => {
      process.env.BACKEND_URL = 'http://test-server.com';

      oidcService.getLoginUrl.mockResolvedValue(
        'https://idp.example.com/auth?state=abc',
      );

      const req = {
        protocol: 'https',
        get: jest.fn().mockReturnValue('api.example.com'), // Should be ignored
      } as any;
      const res = { redirect: jest.fn() } as any;

      await controller.externalLogin('generic', req, res);

      expect(oidcService.getLoginUrl).toHaveBeenCalledWith(
        'generic',
        'http://test-server.com/auth/external/callback/generic',
      );
      expect(res.redirect).toHaveBeenCalledWith(
        'https://idp.example.com/auth?state=abc',
      );
    });
  });

  describe('GET /auth/external/callback/:provider', () => {
    it('should redirect to frontend with sso_ticket using BACKEND_URL', async () => {
      process.env.BACKEND_URL = 'http://test-server.com';

      const profile = {
        username: 'testuser',
        email: 'test@example.com',
        fullname: 'Test',
      };
      oidcService.handleCallback.mockResolvedValue(profile);
      authService.loginOidc.mockResolvedValue({
        accessToken: 'at',
        refreshToken: 'rt',
        expiresIn: 900,
        mustChangePassword: false,
      } as any);
      oidcService.createSsoTicket.mockResolvedValue('ticket-abc');

      const req = {
        protocol: 'https',
        get: jest.fn().mockReturnValue('api.example.com'), // Ignored for redirectUri
        url: '/auth/external/callback/generic?code=xyz&state=abc',
        headers: { 'user-agent': 'test' },
        ip: '127.0.0.1',
        socket: { remoteAddress: '127.0.0.1' },
      } as any;
      const res = { redirect: jest.fn() } as any;

      await controller.externalCallback('generic', req, res);

      expect(oidcService.handleCallback).toHaveBeenCalledWith(
        'generic',
        'http://test-server.com/auth/external/callback/generic',
        'https://api.example.com/auth/external/callback/generic?code=xyz&state=abc',
      );

      // Must NOT contain access_token or refresh_token in redirect URL
      const redirectUrl = res.redirect.mock.calls[0][0];
      expect(redirectUrl).toContain('sso_ticket=ticket-abc');
      expect(redirectUrl).not.toContain('access_token');
      expect(redirectUrl).not.toContain('refresh_token');

      expect(oidcService.createSsoTicket).toHaveBeenCalledWith({
        accessToken: 'at',
        refreshToken: 'rt',
        expiresIn: 900,
      });
    });
  });

  describe('POST /auth/external/exchange', () => {
    it('should exchange sso_ticket for tokens', async () => {
      const tokenData = {
        accessToken: 'at',
        refreshToken: 'rt',
        expiresIn: 900,
      };
      oidcService.consumeSsoTicket.mockResolvedValue(tokenData);

      const res = { cookie: jest.fn() } as any;
      const result = await controller.exchangeSsoTicket({
        ssoTicket: 'ticket-abc',
      }, res);

      expect(oidcService.consumeSsoTicket).toHaveBeenCalledWith('ticket-abc');
      expect(res.cookie).toHaveBeenCalledTimes(2);
      expect(result).toEqual({
        expiresIn: 900,
      });
    });

    it('should throw if ticket is invalid', async () => {
      oidcService.consumeSsoTicket.mockRejectedValue(
        new UnauthorizedException('Invalid or expired SSO ticket'),
      );

      const res = { cookie: jest.fn() } as any;
      await expect(
        controller.exchangeSsoTicket({ ssoTicket: 'bad-ticket' }, res),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
