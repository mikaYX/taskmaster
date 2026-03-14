import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { REDIS_CLIENT } from '../src/common/redis/redis.module';

describe('Auth Chaos Testing (E2E)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let currentRefreshToken: string;
  let currentAccessToken: string;
  let redisClient: any;

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
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'testchaosuser', password: 'chaos_password123' })
      .expect(200);

    currentAccessToken = res.body.accessToken;
    currentRefreshToken = res.body.refreshToken;
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
        .get('/auth/session')
        .set('Authorization', `Bearer ${currentAccessToken}`)
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
    const res = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: currentRefreshToken })
      .expect(200);
    const duration = Date.now() - start;

    // Le refresh doit réussir même s'il est très lent, pas de fail explicite
    expect(duration).toBeGreaterThanOrEqual(2500);
    expect(res.body.accessToken).toBeDefined();

    // Anti-fuite
    expect(res.body.passwordHash).toBeUndefined();
  });

  it('3. Chaos: Perte réseau réponse Refresh (Retry Client Legit)', async () => {
    // Le client envoie un refresh mais "perd" la connexion avant de lire la réponse.
    // Le backend a bien effectué la rotation.
    // Le client rejoue le refresh original avec le même token (retry grace window).

    // Appel #1 (Backend traite, client perd la co / ignore)
    const res1 = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: currentRefreshToken })
      .expect(200);

    const nextValidToken = res1.body.refreshToken;

    // Appel #2 (Le client re-envoie immédiatement le token précédent, pensant qu'il n'est pas passé)
    const res2 = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: currentRefreshToken })
      .expect(401); // Le backend refuse la rotation (gently) avec un 401

    expect(res2.body.message).toContain('Invalid or expired'); // Transmis au client pour le forcer à recharger ou utiliser le token mis en cache

    // Mais L'INVARIANT fondamental : La ressource protégée ne doit pas devenir inaccessible avec le NOUVEAU token !
    // La famille n'a pas été révoquée par le 2e appel (Grâce accordée).
    const res3 = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: nextValidToken }) // Retry later with correct
      .expect(200);

    expect(res3.body.accessToken).toBeDefined();
  });

  it('4. Chaos: Backend Clock Skew (Désynchronisation Heure Serveur)', async () => {
    // Si l'horloge système du serveur avance subitement de 5 minutes (NTP bug)
    // La rotation de token doit correctement détecter que la révocation vient juste d'avoir lieu ou est légèrement hors temps,
    // Mais ne doit surtout pas crasher.
    const fakeNow = new Date(Date.now() + 5 * 60 * 1000); // +5 min
    jest.useFakeTimers({ advanceTimers: true });
    jest.setSystemTime(fakeNow);

    try {
      const res = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: currentRefreshToken });

      // Peut aboutir à un refresh OK ou un 401 expiré, l'important est qu'il n'y ait PAS de code HTTP 500
      expect([200, 401]).toContain(res.status);
    } finally {
      jest.useRealTimers();
    }
  }, 15000);
});
