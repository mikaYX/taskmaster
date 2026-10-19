import { ConflictException, Injectable, Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Counter } from 'prom-client';
import Redis from 'ioredis';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma';
import { REDIS_CLIENT } from '../common/redis/redis.module';
import { anonymizeIp } from '../common/utils/ip-anonymizer.util';
import { SettingsService } from '../settings/settings.service';
import {
  SESSION_TIMEOUT_DEFAULT_MINUTES,
  refreshTokenLifetimeMs,
  resolveSessionTimeoutMinutes,
} from './auth.constants';

/**
 * Another request is already rotating this very token (two tabs, a retry after
 * a lost response). That is not an attack and the session is intact: the caller
 * must simply try again, and the cookie must be left alone (HTTP 409).
 */
export class RefreshInProgressException extends ConflictException {
  constructor() {
    super('Refresh already in progress');
  }
}

/**
 * Refresh Token Service.
 *
 * Security implementation:
 * - Tokens are hashed with SHA-256 before storage
 * - Token rotation: each refresh generates new token, invalidates old
 * - Family ID tracks rotation chain for replay attack detection
 * - If a revoked token is used, entire family is revoked (stolen token detection)
 */
@Injectable()
export class RefreshTokenService {
  private readonly logger = new Logger(RefreshTokenService.name);

  /** Redis key prefix for distributed refresh lock */
  private static readonly REFRESH_LOCK_PREFIX = 'auth:refresh_lock:';
  /** TTL of the lock in seconds — must be > max expected rotation latency */
  private static readonly REFRESH_LOCK_TTL_SECONDS = 5;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly settings: SettingsService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @InjectMetric('auth_refresh_success_total')
    private readonly refreshSuccessCounter: Counter<string>,
    @InjectMetric('auth_refresh_failure_total')
    private readonly refreshFailureCounter: Counter<string>,
    @InjectMetric('auth_refresh_reuse_in_grace_total')
    private readonly reuseInGraceCounter: Counter<string>,
    @InjectMetric('auth_refresh_reuse_out_of_grace_total')
    private readonly reuseOutOfGraceCounter: Counter<string>,
    @InjectMetric('auth_refresh_revoke_family_total')
    private readonly revokeFamilyCounter: Counter<string>,
  ) {}

  /** The session policy (minutes without contact), read defensively and cached by the settings service. */
  private async sessionTimeoutMinutes(): Promise<number> {
    try {
      return resolveSessionTimeoutMinutes(
        await this.settings.getRawValue('auth.session.timeout'),
      );
    } catch {
      return SESSION_TIMEOUT_DEFAULT_MINUTES;
    }
  }

  /**
   * Acquires a distributed Redis lock for a given token hash.
   * Returns true if the lock was acquired, false if already held.
   */
  private async acquireRefreshLock(tokenHash: string): Promise<boolean> {
    const key = `${RefreshTokenService.REFRESH_LOCK_PREFIX}${tokenHash}`;
    const result = await this.redis.set(
      key,
      '1',
      'EX',
      RefreshTokenService.REFRESH_LOCK_TTL_SECONDS,
      'NX',
    );
    return result === 'OK';
  }

  private async releaseRefreshLock(tokenHash: string): Promise<void> {
    const key = `${RefreshTokenService.REFRESH_LOCK_PREFIX}${tokenHash}`;
    await this.redis.del(key);
  }

  /**
   * Generates a cryptographically secure refresh token.
   */
  generateToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Hashes a token using SHA-256.
   */
  hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * Creates a new refresh token for a user.
   * Returns the raw token (only shown once).
   */
  async createToken(
    userId: number,
    userAgent?: string,
    ipAddress?: string,
    familyId?: string,
    role?: string,
  ): Promise<{ token: string; expiresAt: Date }> {
    const token = this.generateToken();
    const tokenHash = this.hashToken(token);
    const lifetimeMs = refreshTokenLifetimeMs(
      role,
      await this.sessionTimeoutMinutes(),
    );
    const expiresAt = new Date(Date.now() + lifetimeMs);

    // Use provided familyId or create new one
    const family = familyId || crypto.randomUUID();

    // GDPR Art. 5(1)(c) — anonymize IP before persistence (AUDIT.md #8, §15.3).
    // Helper preserves null/undefined; bad inputs become null (Prisma stores as NULL).
    const maskedIp = anonymizeIp(ipAddress) ?? undefined;

    await this.prisma.client.refreshToken.create({
      data: {
        userId,
        tokenHash,
        familyId: family,
        expiresAt,
        userAgent,
        ipAddress: maskedIp,
      },
    });

    this.logger.debug(
      `Created refresh token for user ${userId}, family ${family}`,
    );

    return { token, expiresAt };
  }

  /**
   * Validates and rotates a refresh token.
   *
   * Security: If token was already used (revoked), revoke entire family
   * to detect token theft.
   */
  async rotateToken(
    rawToken: string,
    userAgent?: string,
    ipAddress?: string,
  ): Promise<{ token: string; expiresAt: Date; userId: number } | null> {
    const tokenHash = this.hashToken(rawToken);

    // Distributed lock: prevents concurrent requests from racing on the same token.
    // A second request arriving before the first completes is gracefully rejected.
    const locked = await this.acquireRefreshLock(tokenHash);
    if (!locked) {
      this.logger.warn(
        `[AUTH-AUDIT] Concurrent refresh blocked by Redis lock for hash ${tokenHash}`,
      );
      this.reuseInGraceCounter.inc();
      throw new RefreshInProgressException();
    }

    try {
      return await this.rotateTokenInner(tokenHash, userAgent, ipAddress);
    } finally {
      await this.releaseRefreshLock(tokenHash);
    }
  }

  private async rotateTokenInner(
    tokenHash: string,
    userAgent?: string,
    ipAddress?: string,
  ): Promise<{ token: string; expiresAt: Date; userId: number } | null> {
    const existingToken = await this.prisma.client.refreshToken.findUnique({
      where: { tokenHash },
      include: {
        user: { select: { id: true, deletedAt: true, role: true } },
      },
    });

    if (!existingToken) {
      this.logger.warn(
        `[AUTH-AUDIT] Refresh token not found for hash: ${tokenHash}`,
      );
      this.refreshFailureCounter.inc({ reason: 'invalid_token' });
      return null;
    }

    this.logger.log(
      `[AUTH-AUDIT] rotateToken: Found existing token in family ${existingToken.familyId}. RevokedAt: ${existingToken.revokedAt?.toISOString() || 'null'}`,
    );

    // Check if token was already revoked (potential theft / replay)
    if (existingToken.revokedAt) {
      const graceWindowEnabled = this.configService.get<boolean>(
        'AUTH_GRACE_WINDOW_ENABLED',
        true,
      );

      if (graceWindowEnabled) {
        const graceWindowSeconds = this.configService.get<number>(
          'AUTH_GRACE_WINDOW_SECONDS',
          30,
        );

        const now = new Date();
        const revokedTime = existingToken.revokedAt.getTime();
        const timeSinceRevocation = (now.getTime() - revokedTime) / 1000;

        if (timeSinceRevocation <= graceWindowSeconds) {
          // Legitimate fail-safe / retry within grace window.
          // We reject the request to prevent double execution, but we DO NOT revoke the family.
          this.logger.warn(
            `[AUTH-AUDIT] Concurrent refresh attempted within grace window (${timeSinceRevocation.toFixed(1)}s <= ${graceWindowSeconds}s). Rejecting gently.`,
          );
          this.reuseInGraceCounter.inc();
          throw new RefreshInProgressException();
        }
      }

      // Outside grace window or grace window disabled: true stolen token or replay attack
      this.logger.error(
        `[AUTH-AUDIT] SECURITY: Revoked token reuse detected! Family: ${existingToken.familyId} revoked.`,
      );
      this.reuseOutOfGraceCounter.inc();

      // Revoke entire token family
      await this.revokeFamily(existingToken.familyId);
      return null;
    }

    // Check expiration: the stored expiry, and the policy as it is now. The
    // second part also governs tokens issued before the setting was changed, so
    // lowering the timeout takes effect at once instead of at their next rotation.
    const lifetimeMs = refreshTokenLifetimeMs(
      existingToken.user?.role,
      await this.sessionTimeoutMinutes(),
    );
    const idleMs =
      Date.now() - (existingToken.createdAt?.getTime() ?? Date.now());
    if (existingToken.expiresAt < new Date() || idleMs > lifetimeMs) {
      this.logger.warn('[AUTH-AUDIT] Refresh token expired');
      this.refreshFailureCounter.inc({ reason: 'expired' });
      await this.revokeToken(tokenHash);
      return null;
    }

    // Check user still active
    if (!existingToken.user || existingToken.user.deletedAt) {
      this.logger.warn('[AUTH-AUDIT] User deleted or not found');
      this.refreshFailureCounter.inc({ reason: 'user_not_found' });
      await this.revokeToken(tokenHash);
      return null;
    }

    // Revoke old token atomically to avoid double-rotation on concurrent requests.
    const revoked = await this.tryRevokeActiveToken(tokenHash);
    if (!revoked) {
      this.logger.warn(
        `[AUTH-AUDIT] Concurrent refresh detected during CAS revoke for hash ${tokenHash}. Rejecting gracefully.`,
      );
      this.reuseInGraceCounter.inc();
      throw new RefreshInProgressException();
    }

    // Create new token in same family
    const newToken = await this.createToken(
      existingToken.userId,
      userAgent,
      ipAddress,
      existingToken.familyId,
      existingToken.user.role,
    );

    this.logger.debug(
      `[AUTH-AUDIT] Rotated refresh token for user ${existingToken.userId}, family ${existingToken.familyId}`,
    );

    this.refreshSuccessCounter.inc();

    return {
      ...newToken,
      userId: existingToken.userId,
    };
  }

  /**
   * Revokes a specific token.
   */
  async revokeToken(tokenHash: string): Promise<void> {
    await this.prisma.client.refreshToken.update({
      where: { tokenHash },
      data: { revokedAt: new Date() },
    });
  }

  private async tryRevokeActiveToken(tokenHash: string): Promise<boolean> {
    const result = await this.prisma.client.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return result.count === 1;
  }

  /**
   * Revokes all tokens in a family (used for stolen token detection).
   */
  async revokeFamily(familyId: string): Promise<void> {
    const result = await this.prisma.client.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    this.revokeFamilyCounter.inc();
    this.logger.warn(`Revoked ${result.count} tokens in family ${familyId}`);
  }

  /**
   * Revokes all tokens for a user (logout from all devices).
   */
  async revokeAllUserTokens(userId: number): Promise<void> {
    const result = await this.prisma.client.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    this.logger.log(
      `Revoked ${result.count} refresh tokens for user ${userId}`,
    );
  }

  /**
   * Cleanup expired and revoked tokens older than 30 days.
   */
  async cleanup(): Promise<void> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);

    const result = await this.prisma.client.refreshToken.deleteMany({
      where: {
        OR: [{ expiresAt: { lt: cutoff } }, { revokedAt: { lt: cutoff } }],
      },
    });

    this.logger.log(`Cleaned up ${result.count} old refresh tokens`);
  }
}
