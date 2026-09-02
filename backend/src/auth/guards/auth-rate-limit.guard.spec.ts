import { ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { REDIS_CLIENT } from '../../common/redis/redis.module';
import { AuthRateLimitGuard, AuthRateLimitType } from './auth-rate-limit.guard';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildContext(
  overrides: {
    type?: AuthRateLimitType;
    ip?: string;
    username?: string;
  } = {},
): ExecutionContext {
  const { type, ip = '1.2.3.4', username = 'alice' } = overrides;

  const mockReflector = {
    get: jest.fn().mockReturnValue(type),
  };

  const headers: Record<string, string> = {};
  const setHeader = jest.fn();

  const req = {
    headers,
    ip,
    socket: { remoteAddress: ip },
    body: { username },
  };
  const res = { setHeader };

  return {
    getHandler: jest.fn(),
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => res,
    }),
    // Inject reflector mock via the guard's own reflector below
    _reflectorGet: mockReflector.get,
  } as unknown as ExecutionContext;
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('AuthRateLimitGuard', () => {
  let guard: AuthRateLimitGuard;
  let redisMock: { eval: jest.Mock };

  beforeEach(async () => {
    redisMock = { eval: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthRateLimitGuard,
        Reflector,
        { provide: REDIS_CLIENT, useValue: redisMock },
      ],
    }).compile();

    guard = module.get(AuthRateLimitGuard);
  });

  // ─── Pas de métadonnée → laisse passer ────────────────────────────────────
  it('laisse passer si aucun AUTH_RATE_LIMIT_KEY sur le handler', async () => {
    const ctx = buildContext(); // type = undefined
    // Override le reflector injecté pour retourner undefined
    jest.spyOn((guard as any).reflector, 'get').mockReturnValue(undefined);

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(redisMock.eval).not.toHaveBeenCalled();
  });

  // ─── Login : dans les limites ──────────────────────────────────────────────
  it('accepte une requête login sous les seuils', async () => {
    jest
      .spyOn((guard as any).reflector, 'get')
      .mockReturnValue(AuthRateLimitType.LOGIN);
    // 3 fenêtres pour LOGIN — toutes sous le seuil
    redisMock.eval
      .mockResolvedValueOnce(1) // rl:login:ip:60 → 1/5
      .mockResolvedValueOnce(1) // rl:login:ip:900 → 1/10
      .mockResolvedValueOnce(1); // rl:login:user:900 → 1/10

    const ctx = buildContext({ type: AuthRateLimitType.LOGIN });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  // ─── Login : fenêtre courte dépassée ──────────────────────────────────────
  it('rejette (429) quand la fenêtre courte IP est dépassée sur login', async () => {
    jest
      .spyOn((guard as any).reflector, 'get')
      .mockReturnValue(AuthRateLimitType.LOGIN);
    // 1re fenêtre → 6/5 → dépasse
    redisMock.eval.mockResolvedValueOnce(6);

    const ctx = buildContext({ type: AuthRateLimitType.LOGIN });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(HttpException);

    let thrown: HttpException | undefined;
    try {
      await guard.canActivate(ctx);
    } catch (e) {
      thrown = e as HttpException;
    }
    if (thrown) {
      expect(thrown.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    }
  });

  // ─── Login : fenêtre username dépassée ────────────────────────────────────
  it('rejette (429) quand la fenêtre username est dépassée sur login', async () => {
    jest
      .spyOn((guard as any).reflector, 'get')
      .mockReturnValue(AuthRateLimitType.LOGIN);
    redisMock.eval
      .mockResolvedValueOnce(1) // ip court → OK
      .mockResolvedValueOnce(3) // ip soutenu → OK
      .mockResolvedValueOnce(11); // user → 11/10 → KO

    const ctx = buildContext({ type: AuthRateLimitType.LOGIN });
    await expect(guard.canActivate(ctx)).rejects.toMatchObject({
      status: HttpStatus.TOO_MANY_REQUESTS,
    });
  });

  // ─── Refresh : dans les limites ───────────────────────────────────────────
  it('accepte une requête refresh sous les seuils', async () => {
    jest
      .spyOn((guard as any).reflector, 'get')
      .mockReturnValue(AuthRateLimitType.REFRESH);
    redisMock.eval
      .mockResolvedValueOnce(5) // rl:refresh:ip:60 → 5/30
      .mockResolvedValueOnce(10); // rl:refresh:ip:300 → 10/60

    const ctx = buildContext({ type: AuthRateLimitType.REFRESH });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  // ─── Refresh : fenêtre courte dépassée ────────────────────────────────────
  it('rejette (429) quand la fenêtre courte IP est dépassée sur refresh', async () => {
    jest
      .spyOn((guard as any).reflector, 'get')
      .mockReturnValue(AuthRateLimitType.REFRESH);
    redisMock.eval.mockResolvedValueOnce(31); // 31/30 → KO

    const ctx = buildContext({ type: AuthRateLimitType.REFRESH });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(HttpException);
  });

  // ─── Clé username = username normalisé ───────────────────────────────────
  it('utilise le username normalisé comme clé Redis pour la fenêtre user', async () => {
    jest
      .spyOn((guard as any).reflector, 'get')
      .mockReturnValue(AuthRateLimitType.LOGIN);
    redisMock.eval.mockResolvedValue(1);

    const ctx = buildContext({
      type: AuthRateLimitType.LOGIN,
      username: 'Alice',
    });
    await guard.canActivate(ctx);

    // 3e appel eval → clé de la fenêtre user
    const thirdCall = redisMock.eval.mock.calls[2];
    expect(thirdCall[2]).toMatch(/^rl:login:user:900:alice$/);
  });

  // ─── Fallback IP si username absent ──────────────────────────────────────
  it("utilise l'IP comme clé si le username est absent", async () => {
    jest
      .spyOn((guard as any).reflector, 'get')
      .mockReturnValue(AuthRateLimitType.LOGIN);
    redisMock.eval.mockResolvedValue(1);

    const ctx = buildContext({ type: AuthRateLimitType.LOGIN, username: '' });
    await guard.canActivate(ctx);

    const thirdCall = redisMock.eval.mock.calls[2];
    expect(thirdCall[2]).toMatch(/^rl:login:user:900:1\.2\.3\.4$/);
  });

  // ─── Header Retry-After positionné ────────────────────────────────────────
  it('positionne le header Retry-After sur 429', async () => {
    jest
      .spyOn((guard as any).reflector, 'get')
      .mockReturnValue(AuthRateLimitType.REFRESH);
    redisMock.eval.mockResolvedValueOnce(31);

    const headers: Record<string, string> = {};
    const req = {
      headers: {},
      ip: '5.5.5.5',
      socket: { remoteAddress: '5.5.5.5' },
      body: {},
    };
    const res = {
      setHeader: (k: string, v: string) => {
        headers[k] = v;
      },
    };
    const ctx = {
      getHandler: jest.fn(),
      switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
    } as unknown as ExecutionContext;

    await expect(guard.canActivate(ctx)).rejects.toThrow();
    expect(headers['Retry-After']).toBeDefined();
  });

  // ─── Whitelist IP (AUTH_LOCKOUT_IP_WHITELIST) ─────────────────────────────
  describe('AUTH_LOCKOUT_IP_WHITELIST', () => {
    const ORIGINAL = process.env.AUTH_LOCKOUT_IP_WHITELIST;

    afterEach(() => {
      if (ORIGINAL === undefined) {
        delete process.env.AUTH_LOCKOUT_IP_WHITELIST;
      } else {
        process.env.AUTH_LOCKOUT_IP_WHITELIST = ORIGINAL;
      }
    });

    async function buildGuardWithWhitelist(csv: string) {
      process.env.AUTH_LOCKOUT_IP_WHITELIST = csv;
      const redis = { eval: jest.fn() };
      const mod = await Test.createTestingModule({
        providers: [
          AuthRateLimitGuard,
          Reflector,
          { provide: REDIS_CLIENT, useValue: redis },
        ],
      }).compile();
      return { guard: mod.get(AuthRateLimitGuard), redis };
    }

    it('saute les fenêtres IP sur login pour une IP whitelistée mais conserve la fenêtre username', async () => {
      const { guard: g, redis } = await buildGuardWithWhitelist(
        '203.0.113.5, 198.51.100.42',
      );
      jest
        .spyOn((g as any).reflector, 'get')
        .mockReturnValue(AuthRateLimitType.LOGIN);
      // Une seule fenêtre devrait toucher Redis : la fenêtre username.
      redis.eval.mockResolvedValueOnce(1);

      const ctx = buildContext({
        type: AuthRateLimitType.LOGIN,
        ip: '203.0.113.5',
        username: 'alice',
      });
      await expect(g.canActivate(ctx)).resolves.toBe(true);

      expect(redis.eval).toHaveBeenCalledTimes(1);
      const call = redis.eval.mock.calls[0];
      expect(call[2]).toMatch(/^rl:login:user:900:alice$/);
    });

    it("n'exempte pas une IP non whitelistée même si la liste est non vide", async () => {
      const { guard: g, redis } = await buildGuardWithWhitelist('203.0.113.5');
      jest
        .spyOn((g as any).reflector, 'get')
        .mockReturnValue(AuthRateLimitType.LOGIN);
      redis.eval.mockResolvedValue(1);

      const ctx = buildContext({
        type: AuthRateLimitType.LOGIN,
        ip: '8.8.8.8',
        username: 'alice',
      });
      await expect(g.canActivate(ctx)).resolves.toBe(true);

      // Les 3 fenêtres LOGIN ont été évaluées (2 IP + 1 user)
      expect(redis.eval).toHaveBeenCalledTimes(3);
    });

    it('bloque toujours sur la fenêtre username pour une IP whitelistée si le seuil compte est dépassé', async () => {
      const { guard: g, redis } = await buildGuardWithWhitelist('203.0.113.5');
      jest
        .spyOn((g as any).reflector, 'get')
        .mockReturnValue(AuthRateLimitType.LOGIN);
      redis.eval.mockResolvedValueOnce(11); // user → 11/10

      const ctx = buildContext({
        type: AuthRateLimitType.LOGIN,
        ip: '203.0.113.5',
        username: 'alice',
      });
      await expect(g.canActivate(ctx)).rejects.toMatchObject({
        status: HttpStatus.TOO_MANY_REQUESTS,
      });
    });

    it("saute toutes les fenêtres refresh pour une IP whitelistée (refresh n'a pas de fenêtre username)", async () => {
      const { guard: g, redis } = await buildGuardWithWhitelist('203.0.113.5');
      jest
        .spyOn((g as any).reflector, 'get')
        .mockReturnValue(AuthRateLimitType.REFRESH);

      const ctx = buildContext({
        type: AuthRateLimitType.REFRESH,
        ip: '203.0.113.5',
      });
      await expect(g.canActivate(ctx)).resolves.toBe(true);
      expect(redis.eval).not.toHaveBeenCalled();
    });
  });
});
