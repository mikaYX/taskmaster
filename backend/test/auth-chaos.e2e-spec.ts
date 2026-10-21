import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { REDIS_CLIENT } from '../src/common/redis/redis.module';
import {
  TRUSTED_ORIGIN,
  cookieNamed,
  cookiesOf,
  createE2eApp,
  loginCookies,
} from './helpers/e2e-app';

describe('Auth Chaos Testing (E2E)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  /** Session cookies (`refresh_token=…`, `access_token=…`). */
  let currentRefreshToken: string;
  let currentAccessToken: string;
  let redisClient: any;
  const refresh = (refreshCookie: string) =>
    request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Cookie', refreshCookie);

  beforeAll(async () => {
    app = await createE2eApp();

    prisma = app.get(PrismaService);
    redisClient = app.get(REDIS_CLIENT);

    // Ensure user exists
    const hashedPassword = await bcrypt.hash('chaos_password123', 10);
    await prisma.client.user.upsert({
      where: { username: 'testchaosuser' },
      update: { passwordHash: hashedPassword },
      create: {
        email: 'testchaos@local',
        username: 'testchaosuser',
        passwordHash: hashedPassword,
        role: 'USER',
        fullname: 'Test Chaos User',
      },
    });
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  beforeEach(async () => {
    // Obtenir des jetons frais avant chaque test chaotique
    const cookies = await loginCookies(
      app,
      'testchaosuser',
      'chaos_password123',
    );
    currentAccessToken = cookieNamed(cookies, 'access_token')!;
    currentRefreshToken = cookieNamed(cookies, 'refresh_token')!;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('1. Chaos: Redis indisponible (Cache Session Crash)', async () => {
    // On simule un crash Redis lors de l'accès session
    const getSpy = jest
      .spyOn(redisClient, 'get')
      .mockRejectedValue(new Error('Redis connection lost'));
    const setSpy = jest
      .spyOn(redisClient, 'set')
      .mockRejectedValue(new Error('Redis connection lost'));

    try {
      // L'API ne doit PAS crasher en 500, elle doit fallback sur la BDD transparente.
      const res = await request(app.getHttpServer())
        .get('/api/auth/session')
        .set('Cookie', currentAccessToken)
        .expect(200);

      expect(res.body.username).toBe('testchaosuser');
    } finally {
      getSpy.mockRestore();
      setSpy.mockRestore();
    }
  });

  it('2. Chaos: Base de données Postgres lente (Timeout réseau simulé)', async () => {
    // On simule une BDD extrêmement lente sur la rotation de Refresh Token
    const originalUpdateMany = prisma.client.refreshToken.updateMany;
    jest
      .spyOn(prisma.client.refreshToken, 'updateMany')
      // @ts-expect-error - Prisma generic mocks are complex
      .mockImplementation(async (...args: any[]) => {
        // Wait 2.5 seconds to simulate DB lag
        await new Promise((resolve) => setTimeout(resolve, 2500));
        return originalUpdateMany.apply(
          prisma.client.refreshToken,
          args as any,
        );
      });

    const start = Date.now();
    const res = await refresh(currentRefreshToken).expect(200);
    const duration = Date.now() - start;

    // Le refresh doit réussir même s'il est très lent, pas de fail explicite
    // A timer can fire a millisecond or two before Date.now() says so.
    expect(duration).toBeGreaterThanOrEqual(2400);
    expect(cookieNamed(cookiesOf(res), 'access_token')).toBeDefined();
    // Anti-fuite : aucun jeton dans le corps
    expect(res.body.accessToken).toBeUndefined();

    // Anti-fuite
    expect(res.body.passwordHash).toBeUndefined();
  });

  it('3. Chaos: Perte réseau réponse Refresh (Retry Client Legit)', async () => {
    // Le client envoie un refresh mais "perd" la connexion avant de lire la réponse.
    // Le backend a bien effectué la rotation.
    // Le client rejoue le refresh original avec le même token (retry grace window).

    // Appel #1 (Backend traite, client perd la co / ignore)
    const res1 = await refresh(currentRefreshToken).expect(200);

    const nextValidToken = cookieNamed(cookiesOf(res1), 'refresh_token')!;

    // Appel #2 (Le client re-envoie immédiatement le token précédent, pensant qu'il n'est pas passé)
    // Dans la fenêtre de grâce, le backend refuse la rotation en douceur : 409, sans révoquer.
    const res2 = await refresh(currentRefreshToken).expect(409);

    expect(res2.body.error).toContain('Refresh already in progress');

    // Mais L'INVARIANT fondamental : La ressource protégée ne doit pas devenir inaccessible avec le NOUVEAU token !
    // La famille n'a pas été révoquée par le 2e appel (Grâce accordée).
    const res3 = await refresh(nextValidToken).expect(200); // Retry later with correct

    expect(cookieNamed(cookiesOf(res3), 'access_token')).toBeDefined();
  });

  it('4. Chaos: Backend Clock Skew (Désynchronisation Heure Serveur)', async () => {
    // Si l'horloge système du serveur avance subitement de 5 minutes (NTP bug)
    // La rotation de token doit correctement détecter que la révocation vient juste d'avoir lieu ou est légèrement hors temps,
    // Mais ne doit surtout pas crasher.
    const fakeNow = new Date(Date.now() + 5 * 60 * 1000); // +5 min
    jest.useFakeTimers({ advanceTimers: true });
    jest.setSystemTime(fakeNow);

    try {
      const res = await refresh(currentRefreshToken);

      // Peut aboutir à un refresh OK ou un 401 expiré, l'important est qu'il n'y ait PAS de code HTTP 500
      expect([200, 401]).toContain(res.status);
    } finally {
      jest.useRealTimers();
    }
  }, 15000);
});
