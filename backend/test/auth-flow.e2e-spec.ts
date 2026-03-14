import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { REDIS_CLIENT } from '../src/common/redis/redis.module';
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
              claims: () => require('./mock-state').mockState.googleClaims,
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
          idTokenClaims: require('./mock-state').mockState.azureClaims,
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
        const profile = require('./mock-state').mockState.samlProfile;
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
  let currentRefreshToken: string;
  let currentAccessToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.init();

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

  it('1. Login and get initial tokens', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'testauthuser', password: 'password123' })
      .expect(200);

    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();

    currentAccessToken = res.body.accessToken;
    currentRefreshToken = res.body.refreshToken;
  });

  it('2. Refresh successful using valid refresh token', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: currentRefreshToken })
      .expect(200);

    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();

    currentAccessToken = res.body.accessToken;
    currentRefreshToken = res.body.refreshToken; // This is token #2
  });

  it('3. Concurrent Refreshes (Grace Window) - No Wipe Out', async () => {
    // Send two requests exactly at the same time using the SAME valid token
    const [res1, res2] = await Promise.all([
      request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: currentRefreshToken }),
      request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: currentRefreshToken }),
    ]);

    // One should succeed (200), the other should fail (401)
    const statuses = [res1.status, res2.status];
    expect(statuses).toContain(200);
    expect(statuses).toContain(401);

    // Retrieve the new token from the successful request
    const successRes = res1.status === 200 ? res1 : res2;
    expect(successRes.body.accessToken).toBeDefined();
    currentAccessToken = successRes.body.accessToken;
    currentRefreshToken = successRes.body.refreshToken;

    // Verify session still works (family was NOT wiped out)
    await request(app.getHttpServer())
      .get('/auth/session')
      .set('Authorization', `Bearer ${currentAccessToken}`)
      .expect(200);
  });

  it('4. Replay Attack OUTSIDE Grace Window -> Entire Family Revoked', async () => {
    // We rotate current token normally to have a 'used' token
    const rotateRes = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: currentRefreshToken })
      .expect(200);

    const oldRawToken = currentRefreshToken;
    currentAccessToken = rotateRes.body.accessToken;
    const veryNewRefreshToken = rotateRes.body.refreshToken;

    // We manually simulate that 'oldRawToken' was used more than 60s ago
    const hash = crypto.createHash('sha256').update(oldRawToken).digest('hex');

    await prisma.client.refreshToken.updateMany({
      where: { tokenHash: hash },
      data: { revokedAt: new Date(Date.now() - 120000) }, // outside grace window
    });

    // Now, sending oldRawToken should trigger the outside-grace-window thief detection
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: oldRawToken })
      .expect(401);

    // Verify family wipe-out by trying to use the latest valid token (which is in the same family)
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: veryNewRefreshToken })
      .expect(401); // Boom! Everything revoked.
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
        .get('/auth/external/login/google')
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
        .get('/auth/external/callback/google?code=mock-code&state=mock-state')
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
        .get('/auth/external/callback/google?code=mock-code&state=mock-state')
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
        .get('/auth/external/callback/google?code=mock-code&state=mock-state')
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
        .get('/auth/azure/login')
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
        .get('/auth/azure/callback?code=mock-code&state=mock-state')
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
      const res = await request(app.getHttpServer())
        .get('/auth/azure/callback?code=mock-code&state=mock-state')
        .expect(302);

      const user = await prisma.client.user.findFirst({
        where: { email: 'multi@azure.com' },
      });
      expect(user?.authProvider).toBe('AZURE_AD');
    });

    it('should reject if email missing in claims', async () => {
      delete mockState.azureClaims.email;
      await request(app.getHttpServer())
        .get('/auth/azure/callback?code=mock-code&state=mock-state')
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
        .get('/auth/saml/metadata')
        .expect(200);
      expect(res.text).toBe('<md:EntityDescriptor></md:EntityDescriptor>');
    });

    it('should redirect to SAML IdP', async () => {
      const res = await request(app.getHttpServer())
        .get('/auth/saml/login')
        .expect(302);
      expect(res.header.location).toContain(
        'https://idp.example.com/sso?SAMLRequest=mock',
      );
    });

    it('should validate SAML response and create user', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/saml/acs')
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
        .post('/auth/saml/acs')
        .type('form')
        .send({ SAMLResponse: '<invalid></invalid>', RelayState: 'mock-state' })
        .expect(401);
    });

    it('should reject if email missing in assertions', async () => {
      mockState.samlProfile = { displayname: 'SAML User', nameID: 'something' };
      await request(app.getHttpServer())
        .post('/auth/saml/acs')
        .type('form')
        .send({
          SAMLResponse: '<samlp:Response></samlp:Response>',
          RelayState: 'mock-state',
        })
        .expect(401);
    });
  });
});
