import { INestApplication } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import request from 'supertest';
import { REDIS_CLIENT } from '../src/common/redis/redis.module';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  TRUSTED_ORIGIN,
  cookieNamed,
  cookiesOf,
  createE2eApp,
  loginCookies,
} from './helpers/e2e-app';
import { mockState } from './mock-state';

jest.mock('openid-client', () => {
  return {
    Issuer: {
      discover: jest.fn().mockResolvedValue({
        Client: class {
          authorizationUrl = jest
            .fn()
            .mockReturnValue(
              'https://accounts.google.com/o/oauth2/v2/auth?state=mock-state',
            );
          callbackParams = jest
            .fn()
            .mockReturnValue({ state: 'mock-state', code: 'mock-code' });
          callback = jest.fn().mockImplementation(() => {
            return {
              claims: () => mockState.googleClaims,
            };
          });
        },
      }),
    },
    generators: {
      nonce: jest.fn().mockReturnValue('mock-nonce'),
      state: jest.fn().mockReturnValue('mock-state'),
    },
    custom: { setHttpOptionsDefaults: jest.fn() },
  };
});

jest.mock('@azure/msal-node', () => {
  return {
    ConfidentialClientApplication: class {
      getAuthCodeUrl = jest
        .fn()
        .mockResolvedValue(
          'https://login.microsoftonline.com/common/oauth2/v2.0/authorize?state=mock-state',
        );
      acquireTokenByCode = jest.fn().mockImplementation(() => {
        return {
          idTokenClaims: mockState.azureClaims,
        };
      });
    },
  };
});

jest.mock('@node-saml/node-saml', () => {
  return {
    SAML: class {
      constructor() {}
      getAuthorizeUrlAsync = jest
        .fn()
        .mockResolvedValue('https://idp.example.com/sso?SAMLRequest=mock');
      validatePostResponseAsync = jest.fn().mockImplementation(() => {
        const profile = mockState.samlProfile;
        if (!profile) throw new Error('Invalid signature');
        return { profile };
      });
      generateServiceProviderMetadata = jest
        .fn()
        .mockReturnValue('<md:EntityDescriptor></md:EntityDescriptor>');
    },
  };
});

describe('Auth Flow Non-Regression (E2E)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  /** The current session cookies (`access_token=…`, `refresh_token=…`). */
  let session: string[];
  const refresh = (refreshCookie: string) =>
    request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Cookie', refreshCookie);
  const refreshCookieOf = (cookies: string[]) =>
    cookieNamed(cookies, 'refresh_token')!;
  const hashOf = (refreshCookie: string) =>
    crypto
      .createHash('sha256')
      .update(refreshCookie.split('=')[1])
      .digest('hex');

  beforeAll(async () => {
    app = await createE2eApp();

    prisma = app.get(PrismaService);

    // Ensure user exists
    const hashedPassword = await bcrypt.hash('password123', 10);
    await prisma.client.user.upsert({
      where: { username: 'testauthuser' },
      update: { passwordHash: hashedPassword },
      create: {
        email: 'testauth@local',
        username: 'testauthuser',
        passwordHash: hashedPassword,
        role: 'USER',
        fullname: 'Test Auth User',
      },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('1. Login sets the session cookies', async () => {
    session = await loginCookies(app, 'testauthuser', 'password123');

    expect(cookieNamed(session, 'access_token')).toBeDefined();
    expect(cookieNamed(session, 'refresh_token')).toBeDefined();
  });

  it('2. Refresh rotates the refresh token', async () => {
    const res = await refresh(refreshCookieOf(session)).expect(200);
    const next = cookiesOf(res);

    expect(refreshCookieOf(next)).toBeDefined();
    expect(refreshCookieOf(next)).not.toBe(refreshCookieOf(session));
    session = next;
  });

  it('3. Concurrent Refreshes (Grace Window) - No Wipe Out', async () => {
    // Two tabs refreshing with the SAME token at the same time
    const [res1, res2] = await Promise.all([
      refresh(refreshCookieOf(session)),
      refresh(refreshCookieOf(session)),
    ]);

    // One rotates (200), the other is refused gently (409), nothing is revoked
    expect([res1.status, res2.status].sort()).toEqual([200, 409]);
    session = cookiesOf(res1.status === 200 ? res1 : res2);

    // Verify session still works (family was NOT wiped out)
    await request(app.getHttpServer())
      .get('/api/auth/session')
      .set('Cookie', cookieNamed(session, 'access_token')!)
      .expect(200);
  });

  it('4. Replay Attack OUTSIDE Grace Window -> Entire Family Revoked', async () => {
    // We rotate current token normally to have a 'used' token
    const oldRefreshCookie = refreshCookieOf(session);
    const rotateRes = await refresh(oldRefreshCookie).expect(200);
    const veryNewRefreshCookie = refreshCookieOf(cookiesOf(rotateRes));

    // We manually simulate that the old token was used more than 60s ago
    await prisma.client.refreshToken.updateMany({
      where: { tokenHash: hashOf(oldRefreshCookie) },
      data: { revokedAt: new Date(Date.now() - 120000) }, // outside grace window
    });

    // Now, sending the old token triggers the outside-grace-window thief detection
    await refresh(oldRefreshCookie).expect(401);

    // Family wipe-out: no token of the family is active any more...
    const old = await prisma.client.refreshToken.findUnique({
      where: { tokenHash: hashOf(oldRefreshCookie) },
    });
    expect(
      await prisma.client.refreshToken.count({
        where: { familyId: old!.familyId, revokedAt: null },
      }),
    ).toBe(0);
    // ...and the latest token no longer gives a session (409 while its revocation is
    // within the grace window, 401 after).
    const afterTheft = await refresh(veryNewRefreshCookie);
    expect(afterTheft.status).not.toBe(200);
  });

  describe('Google OAuth Flow', () => {
    beforeEach(async () => {
      mockState.googleClaims = {
        email: 'google.user@google.com',
        email_verified: true,
        hd: 'google.com',
        name: 'Google User',
      };
      // Enable Google provider and restrictions
      await prisma.client.config.upsert({
        where: { key: 'auth.google.enabled' },
        update: { value: 'true' },
        create: { key: 'auth.google.enabled', value: 'true' },
      });
      await prisma.client.config.upsert({
        where: { key: 'auth.google.clientId' },
        update: { value: 'client' },
        create: { key: 'auth.google.clientId', value: 'client' },
      });
      await prisma.client.config.upsert({
        where: { key: 'auth.google.clientSecret' },
        update: { value: 'secret' },
        create: { key: 'auth.google.clientSecret', value: 'secret' },
      });
      await prisma.client.config.upsert({
        where: { key: 'auth.google.hostedDomain' },
        update: { value: 'google.com' },
        create: { key: 'auth.google.hostedDomain', value: 'google.com' },
      });
    });

    it('should redirect to Google login', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/auth/external/login/google')
        .expect(302);
      expect(res.header.location).toContain(
        'https://accounts.google.com/o/oauth2/v2/auth?state=mock-state',
      );
    });

    it('should handle Google callback and create user', async () => {
      // Create state in redis
      const redis = app.get(REDIS_CLIENT);
      await redis.set(
        'oidc:state:mock-state',
        JSON.stringify({
          nonce: 'mock-nonce',
          redirectUri: `${process.env.BACKEND_URL || 'http://localhost:3000'}/auth/external/callback/google`,
        }),
      );

      const res = await request(app.getHttpServer())
        .get(
          '/api/auth/external/callback/google?code=mock-code&state=mock-state',
        )
        .expect(302);
      expect(res.header.location).toContain('sso_ticket=');

      const user = await prisma.client.user.findFirst({
        where: { email: 'google.user@google.com' },
      });
      expect(user).toBeDefined();
      expect(user?.authProvider).toBe('OIDC');
    });

    it('should reject if hostedDomain mismatch', async () => {
      mockState.googleClaims.hd = 'otherdomain.com';
      mockState.googleClaims.email = 'test@otherdomain.com';

      const redis = app.get(REDIS_CLIENT);
      await redis.set(
        'oidc:state:mock-state',
        JSON.stringify({
          nonce: 'mock-nonce',
          redirectUri: `${process.env.BACKEND_URL || 'http://localhost:3000'}/auth/external/callback/google`,
        }),
      );

      await request(app.getHttpServer())
        .get(
          '/api/auth/external/callback/google?code=mock-code&state=mock-state',
        )
        .expect(401);
    });

    it('should reject if email_verified is false', async () => {
      mockState.googleClaims.hd = 'google.com';
      mockState.googleClaims.email = 'unverified@google.com';
      mockState.googleClaims.email_verified = false;

      const redis = app.get(REDIS_CLIENT);
      await redis.set(
        'oidc:state:mock-state',
        JSON.stringify({
          nonce: 'mock-nonce',
          redirectUri: `${process.env.BACKEND_URL || 'http://localhost:3000'}/auth/external/callback/google`,
        }),
      );

      await request(app.getHttpServer())
        .get(
          '/api/auth/external/callback/google?code=mock-code&state=mock-state',
        )
        .expect(401);
    });
  });

  describe('Azure AD Flow', () => {
    beforeEach(async () => {
      mockState.azureClaims = {
        email: 'azure.user@azure.com',
        name: 'Azure User',
        tid: 'common',
        oid: 'user1',
      };
      await prisma.client.config.upsert({
        where: { key: 'auth.azureAd.enabled' },
        update: { value: 'true' },
        create: { key: 'auth.azureAd.enabled', value: 'true' },
      });
      await prisma.client.config.upsert({
        where: { key: 'auth.azureAd.clientId' },
        update: { value: 'client' },
        create: { key: 'auth.azureAd.clientId', value: 'client' },
      });
      await prisma.client.config.upsert({
        where: { key: 'auth.azureAd.clientSecret' },
        update: { value: 'secret' },
        create: { key: 'auth.azureAd.clientSecret', value: 'secret' },
      });
      await prisma.client.config.upsert({
        where: { key: 'auth.azureAd.tenantId' },
        update: { value: 'common' },
        create: { key: 'auth.azureAd.tenantId', value: 'common' },
      });
    });

    it('should redirect to Azure AD login', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/auth/azure/login')
        .expect(302);
      expect(res.header.location).toContain(
        'https://login.microsoftonline.com',
      );
    });

    it('should handle Azure callback and create user', async () => {
      const redis = app.get(REDIS_CLIENT);
      await redis.set(
        'azure-state:mock-state',
        JSON.stringify({
          nonce: 'mock-nonce',
          redirectUri: `${process.env.BACKEND_URL || 'http://localhost:3000'}/auth/azure/callback`,
        }),
      );

      const res = await request(app.getHttpServer())
        .get('/api/auth/azure/callback?code=mock-code&state=mock-state')
        .expect(302);
      expect(res.header.location).toContain('sso_ticket=');

      const user = await prisma.client.user.findFirst({
        where: { email: 'azure.user@azure.com' },
      });
      expect(user).toBeDefined();
      expect(user?.authProvider).toBe('AZURE_AD');
    });

    it('should support multi-tenant (common)', async () => {
      const redis = app.get(REDIS_CLIENT);
      await redis.set(
        'azure-state:mock-state',
        JSON.stringify({
          nonce: 'mock-nonce',
          redirectUri: `${process.env.BACKEND_URL || 'http://localhost:3000'}/auth/azure/callback`,
        }),
      );

      mockState.azureClaims.tid = 'some-other-tenant';
      mockState.azureClaims.email = 'multi@azure.com';
      await request(app.getHttpServer())
        .get('/api/auth/azure/callback?code=mock-code&state=mock-state')
        .expect(302);

      const user = await prisma.client.user.findFirst({
        where: { email: 'multi@azure.com' },
      });
      expect(user?.authProvider).toBe('AZURE_AD');
    });

    it('should reject if email missing in claims', async () => {
      delete mockState.azureClaims.email;
      await request(app.getHttpServer())
        .get('/api/auth/azure/callback?code=mock-code&state=mock-state')
        .expect(401);
    });
  });

  describe('SAML Flow', () => {
    beforeEach(async () => {
      mockState.samlProfile = {
        email: 'saml.user@saml.com',
        displayname: 'SAML User',
        nameID: 'saml.user@saml.com',
      };
      await prisma.client.config.upsert({
        where: { key: 'auth.generic.saml.enabled' },
        update: { value: 'true' },
        create: { key: 'auth.generic.saml.enabled', value: 'true' },
      });
      await prisma.client.config.upsert({
        where: { key: 'auth.generic.saml.ssoUrl' },
        update: { value: 'https://idp/sso' },
        create: { key: 'auth.generic.saml.ssoUrl', value: 'https://idp/sso' },
      });
      await prisma.client.config.upsert({
        where: { key: 'auth.generic.saml.entityId' },
        update: { value: 'entity' },
        create: { key: 'auth.generic.saml.entityId', value: 'entity' },
      });
      await prisma.client.config.upsert({
        where: { key: 'auth.generic.saml.x509' },
        update: { value: 'x509-cert' },
        create: { key: 'auth.generic.saml.x509', value: 'x509-cert' },
      });
    });

    it('should generate valid SP metadata XML', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/auth/saml/metadata')
        .expect(200);
      expect(res.text).toBe('<md:EntityDescriptor></md:EntityDescriptor>');
    });

    it('should redirect to SAML IdP', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/auth/saml/login')
        .expect(302);
      expect(res.header.location).toContain(
        'https://idp.example.com/sso?SAMLRequest=mock',
      );
    });

    it('should validate SAML response and create user', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/saml/acs')
        .type('form')
        .send({
          SAMLResponse: '<samlp:Response></samlp:Response>',
          RelayState: 'mock-state',
        })
        .expect(302);

      expect(res.header.location).toContain('sso_ticket=');

      const user = await prisma.client.user.findFirst({
        where: { email: 'saml.user@saml.com' },
      });
      expect(user).toBeDefined();
      expect(user?.authProvider).toBe('SAML');
    });

    it('should reject if signature invalid', async () => {
      mockState.samlProfile = null as any;
      await request(app.getHttpServer())
        .post('/api/auth/saml/acs')
        .type('form')
        .send({ SAMLResponse: '<invalid></invalid>', RelayState: 'mock-state' })
        .expect(401);
    });

    it('should reject if email missing in assertions', async () => {
      mockState.samlProfile = { displayname: 'SAML User', nameID: 'something' };
      await request(app.getHttpServer())
        .post('/api/auth/saml/acs')
        .type('form')
        .send({
          SAMLResponse: '<samlp:Response></samlp:Response>',
          RelayState: 'mock-state',
        })
        .expect(401);
    });
  });
});
