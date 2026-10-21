import { INestApplication } from '@nestjs/common';
import { Test, TestingModuleBuilder } from '@nestjs/testing';
import { ThrottlerStorage } from '@nestjs/throttler';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { AuthRateLimitGuard } from '../../src/auth/guards/auth-rate-limit.guard';
import { GlobalExceptionFilter, GlobalValidationPipe } from '../../src/common';

/** An origin CsrfTokenGuard trusts outside production. */
export const TRUSTED_ORIGIN = 'http://localhost:5173';

/**
 * Boots AppModule the way main.ts does (cookies, `/api` prefix, validation,
 * exception filter): the auth cookies are scoped to `/api`, so a bare app
 * never receives them back.
 *
 * Rate limits are switched off: suites log in more than 5 times a minute from
 * the same address. They have their own unit tests (auth-rate-limit.guard.spec).
 */
export async function createE2eApp(
  configure: (builder: TestingModuleBuilder) => TestingModuleBuilder = (b) => b,
): Promise<INestApplication> {
  const builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(ThrottlerStorage)
    .useValue({
      increment: async () => ({
        totalHits: 1,
        timeToExpire: 60,
        isBlocked: false,
        timeToBlockExpire: 0,
      }),
    })
    .overrideGuard(AuthRateLimitGuard)
    .useValue({ canActivate: () => true });

  const moduleRef = await configure(builder).compile();
  const app = moduleRef.createNestApplication();
  app.use(cookieParser());
  app.useGlobalPipes(new GlobalValidationPipe());
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.setGlobalPrefix('api');
  await app.init();
  return app;
}

/** `name=value` pairs of the cookies a response sets, ready for a `Cookie` header. */
export function cookiesOf(res: request.Response): string[] {
  return (res.get('Set-Cookie') ?? []).map((cookie) => cookie.split(';')[0]);
}

/** One cookie (`name=value`) out of a list, or undefined. */
export function cookieNamed(
  cookies: string[],
  name: 'access_token' | 'refresh_token',
): string | undefined {
  return cookies.find((cookie) => cookie.startsWith(`${name}=`));
}

/** Logs in and returns the session cookies (`access_token`, `refresh_token`). */
export async function loginCookies(
  app: INestApplication,
  username: string,
  password: string,
): Promise<string[]> {
  const res = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ username, password })
    .expect(200);
  return cookiesOf(res);
}
