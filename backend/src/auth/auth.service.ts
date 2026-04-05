import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  Logger,
  Inject,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../common/redis/redis.module';
import { PrismaService } from '../prisma';
import { RefreshTokenService } from './refresh-token.service';
import { JwtPayload, UserSitePayload } from './strategies/jwt.strategy';
import { MfaService } from './mfa.service';
import { LdapService } from './ldap.service';
import { SettingsService } from '../settings/settings.service';
import { OidcProfile } from './oidc.service';
import { AzureAdProfile } from './azure-ad.service';
import { SamlProfile } from './saml.service';

/**
 * Token response structure.
 */
export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/**
 * Authentication Service.
 *
 * Handles:
 * - User authentication (local)
 * - JWT access token generation (15 minutes)
 * - Refresh token management with rotation
 * - Password hashing and verification
 * - Session caching (Redis) for performance
 *
 * Security decisions:
 * - Access token: 15 minutes (short-lived for security)
 * - Refresh token: 7 days, stored hashed in DB with rotation
 * - Passwords hashed with bcrypt (12 rounds)
 * - No fallback for AUTH_SECRET (enforced at startup)
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly accessTokenExpiresIn = 15 * 60; // 15 minutes in seconds

  private readonly LOCKOUT_WINDOW_1 = 300; // 5 mins
  private readonly LOCKOUT_LIMIT_1 = 5;
  private readonly LOCKOUT_PENALTY_1 = 300;

  private readonly LOCKOUT_WINDOW_2 = 1800; // 30 mins
  private readonly LOCKOUT_LIMIT_2 = 10;
  private readonly LOCKOUT_PENALTY_2 = 1800;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly refreshTokenService: RefreshTokenService,
    private readonly mfaService: MfaService,
    private readonly ldapService: LdapService,
    private readonly settingsService: SettingsService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  private async checkLockout(identity: string, ip: string): Promise<void> {
    const keyId = `lockout:id:${identity}:blocked`;
    const keyIp = `lockout:ip:${ip}:blocked`;

    const [blockId, blockIp] = await Promise.all([
      this.redis.get(keyId),
      this.redis.get(keyIp),
    ]);

    if (blockId || blockIp) {
      this.logger.warn(
        `[AUTH_METRIC_LOCKED_OUT] Login attempt blocked for identity ${identity} from IP ${ip}`,
      );
      throw new UnauthorizedException(
        'Too many failed attempts. Account temporarily locked.',
      );
    }
  }

  private async recordFailedLogin(
    identity: string,
    ip: string,
    motif: string,
  ): Promise<never> {
    const keyId = `lockout:id:${identity}`;
    const keyIp = `lockout:ip:${ip}`;

    this.logger.warn(
      `[AUTH_METRIC_FAIL] motif=${motif} identity=${identity} ip=${ip}`,
    );

    const [countId, countIp] = await Promise.all([
      this.redis.incr(keyId),
      this.redis.incr(keyIp),
    ]);

    if (countId === 1) await this.redis.expire(keyId, this.LOCKOUT_WINDOW_2);
    if (countIp === 1) await this.redis.expire(keyIp, this.LOCKOUT_WINDOW_2);

    const applyPenalty = async (key: string, count: number) => {
      if (count >= this.LOCKOUT_LIMIT_2) {
        this.logger.warn(
          `[AUTH_ALERT_SPIKE_DETECTED] High failure rate for ${key}. Applying level 2 penalty.`,
        );
        await this.redis.set(
          `${key}:blocked`,
          '1',
          'EX',
          this.LOCKOUT_PENALTY_2,
        );
      } else if (count === this.LOCKOUT_LIMIT_1) {
        this.logger.warn(
          `[AUTH_ALERT_SPIKE_DETECTED] Moderate failure rate for ${key}. Applying level 1 penalty.`,
        );
        await this.redis.set(
          `${key}:blocked`,
          '1',
          'EX',
          this.LOCKOUT_PENALTY_1,
        );
      }
    };

    await Promise.all([
      applyPenalty(keyId, countId),
      applyPenalty(keyIp, countIp),
    ]);
    throw new UnauthorizedException('Invalid credentials');
  }

  private async recordSuccessfulLogin(
    identity: string,
    ip: string,
  ): Promise<void> {
    this.logger.log(
      `[AUTH_METRIC_SUCCESS] Login successful for identity=${identity} ip=${ip}`,
    );
    await Promise.all([
      this.redis.del(`lockout:id:${identity}`),
      this.redis.del(`lockout:ip:${ip}`),
      this.redis.del(`lockout:id:${identity}:blocked`),
      this.redis.del(`lockout:ip:${ip}:blocked`),
    ]);
  }

  /**
   * Validates user credentials and returns tokens.
   */
  async login(
    username: string,
    password: string,
    userAgent?: string,
    ipAddress?: string,
  ): Promise<
    | (TokenResponse & { mustChangePassword: boolean })
    | { requiresMfa: boolean; mfaToken: string }
  > {
    // Normalize username
    const normalizedUsername = username.trim().toLowerCase();
    const ip = ipAddress || 'unknown';

    await this.checkLockout(normalizedUsername, ip);

    // 1. Try LDAP first if enabled
    const ldapProfile = await this.ldapService.authenticate(
      normalizedUsername,
      password,
    );

    let user = await this.prisma.client.user.findFirst({
      where: {
        username: normalizedUsername,
        deletedAt: null,
      },
      include: {
        groupMemberships: {
          include: {
            group: true,
          },
        },
      },
    });

    if (ldapProfile) {
      // LDAP Authentication Successful
      if (user) {
        if (user.authProvider !== 'LDAP') {
          return this.recordFailedLogin(
            normalizedUsername,
            ip,
            'ACCOUNT_COLLISION_LDAP',
          );
        } else {
          // Update profile with latest LDAP info
          this.logger.debug(
            `Updating LDAP profile for user: ${normalizedUsername}`,
          );
          user = await this.prisma.client.user.update({
            where: { id: user.id },
            data: {
              email: ldapProfile.email,
              fullname: ldapProfile.fullname,
            },
            include: {
              groupMemberships: {
                include: {
                  group: true,
                },
              },
            },
          });
        }
      } else {
        this.logger.log(
          `JIT provisioning user from LDAP: ${ldapProfile.username}`,
        );
        user = await this.prisma.client.user.create({
          data: {
            username: ldapProfile.username,
            email: ldapProfile.email,
            fullname: ldapProfile.fullname,
            authProvider: 'LDAP',
            role: 'USER',
          },
          include: {
            groupMemberships: {
              include: {
                group: true,
              },
            },
          },
        });
      }
    } else {
      // 2. Fallback to Local Auth (or if LDAP disabled)
      if (!user) {
        return this.recordFailedLogin(normalizedUsername, ip, 'USER_NOT_FOUND');
      }

      if (user.authProvider !== 'LOCAL') {
        return this.recordFailedLogin(normalizedUsername, ip, 'WRONG_PROVIDER');
      }

      if (!user.passwordHash) {
        return this.recordFailedLogin(normalizedUsername, ip, 'NO_PASSWORD');
      }

      const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

      if (!isPasswordValid) {
        return this.recordFailedLogin(normalizedUsername, ip, 'BAD_PASSWORD');
      }
    }

    if (user.mfaEnabled) {
      this.logger.log(`User ${user.username} requires MFA`);
      const payload = {
        sub: user.id,
        username: user.username,
        type: 'mfa_pending',
      };
      const mfaToken = this.jwtService.sign(payload, { expiresIn: '5m' });
      return { requiresMfa: true, mfaToken };
    }

    await this.recordSuccessfulLogin(normalizedUsername, ip);
    return this.completeLogin(user.id, userAgent, ipAddress);
  }

  /**
   * Completes the login process and issues final tokens.
   */
  async completeLogin(
    userId: number,
    userAgent?: string,
    ipAddress?: string,
  ): Promise<TokenResponse & { mustChangePassword: boolean }> {
    const user = await this.prisma.client.user.findFirst({
      where: {
        id: userId,
        deletedAt: null,
      },
      include: {
        groupMemberships: {
          include: {
            group: true,
          },
        },
        sites: {
          include: {
            site: {
              select: { id: true, name: true, code: true },
            },
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const groups = user.groupMemberships.map((m) => m.group.name);
    const groupIds = user.groupMemberships.map((m) => m.group.id);
    let sites: UserSitePayload[] = [];

    if (user.role === 'SUPER_ADMIN') {
      const allSites = await this.prisma.client.site.findMany({
        where: { isActive: true },
      });
      sites = allSites.map((s) => ({
        siteId: s.id,
        siteName: s.name,
        siteCode: s.code,
        isDefault: false,
      }));
    } else {
      sites = (user.sites || []).map((s) => ({
        siteId: s.site.id,
        siteName: s.site.name,
        siteCode: s.site.code,
        isDefault: s.isDefault,
      }));
    }

    const accessToken = this.generateAccessToken(
      user.id,
      user.username,
      user.role,
      groups,
      groupIds,
      sites,
    );
    const { token: refreshToken } = await this.refreshTokenService.createToken(
      user.id,
      userAgent,
      ipAddress,
    );

    this.logger.log(`User login completed: ${user.username}`);

    return {
      accessToken,
      refreshToken,
      expiresIn: this.accessTokenExpiresIn,
      mustChangePassword: user.mustChangePassword,
    };
  }

  /**
   * Log in or JIT provision a user via OIDC SSO.
   */
  async loginOidc(
    profile: OidcProfile,
    userAgent?: string,
    ipAddress?: string,
  ): Promise<TokenResponse> {
    const normalizedUsername = profile.username.trim().toLowerCase();

    let user = await this.prisma.client.user.findFirst({
      where: {
        username: normalizedUsername,
        deletedAt: null,
      },
      include: {
        groupMemberships: {
          include: {
            group: true,
          },
        },
      },
    });

    if (user) {
      if (user.authProvider !== 'OIDC') {
        this.logger.warn(
          `Account collision: Local user exists with same username '${normalizedUsername}' but provider is not OIDC.`,
        );
        throw new UnauthorizedException(
          'Please authenticate using your regular credentials.',
        );
      }

      this.logger.debug(
        `Updating OIDC profile for user: ${normalizedUsername}`,
      );
      user = await this.prisma.client.user.update({
        where: { id: user.id },
        data: {
          email: profile.email,
          fullname: profile.fullname,
        },
        include: {
          groupMemberships: {
            include: {
              group: true,
            },
          },
        },
      });
    } else {
      this.logger.log(`JIT provisioning user from OIDC: ${normalizedUsername}`);
      user = await this.prisma.client.user.create({
        data: {
          username: normalizedUsername,
          email: profile.email,
          fullname: profile.fullname,
          authProvider: 'OIDC',
          role: 'USER',
        },
        include: {
          groupMemberships: {
            include: {
              group: true,
            },
          },
        },
      });
    }

    if (!user) {
      throw new UnauthorizedException('Failed to retrieve or create user');
    }

    await this.recordSuccessfulLogin(
      normalizedUsername,
      ipAddress || 'unknown',
    );

    return this.completeLogin(
      user.id,
      userAgent,
      ipAddress,
    ) as Promise<TokenResponse>;
  }

  /**
   * Log in or JIT provision a user via Azure AD.
   */
  async loginAzureAd(
    profile: AzureAdProfile,
    userAgent?: string,
    ipAddress?: string,
  ): Promise<TokenResponse> {
    const normalizedUsername = profile.username.trim().toLowerCase();

    let user = await this.prisma.client.user.findFirst({
      where: {
        username: normalizedUsername,
        deletedAt: null,
      },
      include: {
        groupMemberships: {
          include: {
            group: true,
          },
        },
      },
    });

    if (user) {
      if (user.authProvider !== 'AZURE_AD') {
        this.logger.warn(
          `Account collision: Local user exists with same username '${normalizedUsername}' but provider is not AZURE_AD.`,
        );
        throw new UnauthorizedException(
          'Please authenticate using your regular credentials or the correct Identity Provider.',
        );
      }

      this.logger.debug(
        `Updating Azure AD profile for user: ${normalizedUsername}`,
      );
      user = await this.prisma.client.user.update({
        where: { id: user.id },
        data: {
          email: profile.email,
          fullname: profile.fullname,
        },
        include: {
          groupMemberships: {
            include: {
              group: true,
            },
          },
        },
      });
    } else {
      this.logger.log(
        `JIT provisioning user from Azure AD: ${normalizedUsername}`,
      );
      user = await this.prisma.client.user.create({
        data: {
          username: normalizedUsername,
          email: profile.email,
          fullname: profile.fullname,
          authProvider: 'AZURE_AD',
          role: 'USER',
        },
        include: {
          groupMemberships: {
            include: {
              group: true,
            },
          },
        },
      });
    }

    if (!user) {
      throw new UnauthorizedException('Failed to retrieve or create user');
    }

    await this.recordSuccessfulLogin(
      normalizedUsername,
      ipAddress || 'unknown',
    );

    return this.completeLogin(
      user.id,
      userAgent,
      ipAddress,
    ) as Promise<TokenResponse>;
  }

  /**
   * Log in or JIT provision a user via SAML 2.0.
   */
  async loginSaml(
    profile: SamlProfile,
    userAgent?: string,
    ipAddress?: string,
  ): Promise<TokenResponse> {
    const normalizedUsername = profile.username.trim().toLowerCase();

    let user = await this.prisma.client.user.findFirst({
      where: {
        username: normalizedUsername,
        deletedAt: null,
      },
      include: {
        groupMemberships: {
          include: {
            group: true,
          },
        },
      },
    });

    if (user) {
      if (user.authProvider !== 'SAML') {
        this.logger.warn(
          `Account collision: Local user exists with same username '${normalizedUsername}' but provider is not SAML.`,
        );
        throw new UnauthorizedException(
          'Please authenticate using your regular credentials or the correct Identity Provider.',
        );
      }

      this.logger.debug(
        `Updating SAML profile for user: ${normalizedUsername}`,
      );
      user = await this.prisma.client.user.update({
        where: { id: user.id },
        data: {
          email: profile.email,
          fullname: profile.fullname,
        },
        include: {
          groupMemberships: {
            include: {
              group: true,
            },
          },
        },
      });
    } else {
      this.logger.log(`JIT provisioning user from SAML: ${normalizedUsername}`);
      user = await this.prisma.client.user.create({
        data: {
          username: normalizedUsername,
          email: profile.email,
          fullname: profile.fullname,
          authProvider: 'SAML',
          role: 'USER',
        },
        include: {
          groupMemberships: {
            include: {
              group: true,
            },
          },
        },
      });
    }

    if (!user) {
      throw new UnauthorizedException('Failed to retrieve or create user');
    }

    await this.recordSuccessfulLogin(
      normalizedUsername,
      ipAddress || 'unknown',
    );

    return this.completeLogin(
      user.id,
      userAgent,
      ipAddress,
    ) as Promise<TokenResponse>;
  }

  /**
   * Verifies the MFA token and completes the login process.
   */
  async verifyMfaLogin(
    mfaToken: string,
    token: string,
    userAgent?: string,
    ipAddress?: string,
  ): Promise<TokenResponse & { mustChangePassword: boolean }> {
    let payload;
    try {
      payload = this.jwtService.verify(mfaToken);
    } catch (e) {
      throw new UnauthorizedException('Invalid or expired MFA token');
    }

    const ip = ipAddress || 'unknown';
    const identity = payload.username;

    await this.checkLockout(identity, ip);

    if (payload.type !== 'mfa_pending') {
      return this.recordFailedLogin(identity, ip, 'INVALID_MFA_TOKEN_TYPE');
    }

    const isValid = await this.mfaService.verifyMfa(payload.sub, token);
    if (!isValid) {
      return this.recordFailedLogin(identity, ip, 'INVALID_MFA_CODE');
    }

    await this.recordSuccessfulLogin(identity, ip);
    return this.completeLogin(payload.sub, userAgent, ipAddress);
  }

  /**
   * Generates a new access token.
   */
  generateAccessToken(
    userId: number,
    username: string,
    role: string,
    groups: string[],
    groupIds: number[],
    sites: UserSitePayload[] = [],
  ): string {
    const payload: Omit<JwtPayload, 'iat' | 'exp'> = {
      sub: userId,
      username,
      role,
      groups,
      groupIds,
      sites,
    };

    return this.jwtService.sign(payload, {
      expiresIn: this.accessTokenExpiresIn,
    });
  }

  /**
   * Refreshes tokens using a valid refresh token.
   * Implements token rotation for security.
   */
  async refreshTokens(
    refreshToken: string,
    userAgent?: string,
    ipAddress?: string,
  ): Promise<TokenResponse & { mustChangePassword: boolean }> {
    const rotationResult = await this.refreshTokenService.rotateToken(
      refreshToken,
      userAgent,
      ipAddress,
    );

    if (!rotationResult) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const user = await this.prisma.client.user.findFirst({
      where: {
        id: rotationResult.userId,
        deletedAt: null,
      },
      include: {
        groupMemberships: {
          include: {
            group: true,
          },
        },
        sites: {
          include: {
            site: {
              select: { id: true, name: true, code: true },
            },
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const groups = user.groupMemberships.map((m) => m.group.name);
    const groupIds = user.groupMemberships.map((m) => m.group.id);
    let sites: UserSitePayload[] = [];

    if (user.role === 'SUPER_ADMIN') {
      const allSites = await this.prisma.client.site.findMany({
        where: { isActive: true },
      });
      sites = allSites.map((s) => ({
        siteId: s.id,
        siteName: s.name,
        siteCode: s.code,
        isDefault: false,
      }));
    } else {
      sites = (user.sites || []).map((s) => ({
        siteId: s.site.id,
        siteName: s.site.name,
        siteCode: s.site.code,
        isDefault: s.isDefault,
      }));
    }
    const accessToken = this.generateAccessToken(
      user.id,
      user.username,
      user.role,
      groups,
      groupIds,
      sites,
    );

    return {
      accessToken,
      refreshToken: rotationResult.token,
      expiresIn: this.accessTokenExpiresIn,
      mustChangePassword: user.mustChangePassword,
    };
  }

  /**
   * Changes user password.
   */
  async changePassword(userId: number, newPassword: string): Promise<void> {
    const user = await this.prisma.client.user.findUnique({
      where: { id: userId },
    });

    if (!user || user.deletedAt) {
      throw new BadRequestException('User not found');
    }

    if (user.authProvider !== 'LOCAL') {
      throw new BadRequestException(
        'Cannot change password for external authentication provider',
      );
    }

    const passwordHash = await this.hashPassword(newPassword);

    await this.prisma.client.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        mustChangePassword: false,
      },
    });

    // Invalidate session cache
    await this.invalidateSession(userId);
    this.logger.log(`Password changed for user ID: ${userId}`);
  }

  /**
   * Logs out user - revokes all their refresh tokens.
   */
  async logout(userId: number): Promise<void> {
    await this.refreshTokenService.revokeAllUserTokens(userId);
    // Invalidate session cache
    await this.invalidateSession(userId);
    this.logger.log(`User logged out: ${userId}`);
  }

  /**
   * Hashes a password using bcrypt.
   */
  async hashPassword(password: string): Promise<string> {
    const saltRounds = 12;
    return bcrypt.hash(password, saltRounds);
  }

  /**
   * Verifies a password against a hash.
   */
  async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  /**
   * Gets session information for current user.
   * Performs minimal DB check to verify user still exists and is active.
   */
  async getSession(userId: number): Promise<{
    id: number;
    username: string;
    fullname: string | null;
    role: string;
    groups: string[];
    groupIds: number[];
    mustChangePassword: boolean;
    passkeysEnabled: boolean;
    passkeyPolicy: 'disabled' | 'optional' | 'required';
    hasPasskey: boolean;
  } | null> {
    if (!userId) return null;

    const cacheKey = `session:${userId}`;

    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (error) {
      this.logger.warn(`Redis error in getSession: ${error.message}`);
    }

    const user = await this.prisma.client.user.findFirst({
      where: {
        id: userId,
        deletedAt: null,
      },
      select: {
        id: true,
        username: true,
        fullname: true,
        role: true,
        mustChangePassword: true,
        groupMemberships: {
          select: {
            group: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        sites: {
          select: {
            siteId: true,
            isDefault: true,
            site: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },
          },
        },
        passkeys: {
          select: {
            id: true,
          },
        },
      },
    });

    if (!user) {
      return null;
    }

    let sitesResult: UserSitePayload[] = [];
    if (user.role === 'SUPER_ADMIN') {
      const allSites = await this.prisma.client.site.findMany({
        where: { isActive: true },
      });
      sitesResult = allSites.map((s) => ({
        siteId: s.id,
        siteName: s.name,
        siteCode: s.code,
        isDefault: false,
      }));
    } else {
      sitesResult = (user.sites || []).map((s) => ({
        siteId: s.site.id,
        siteName: s.site.name,
        siteCode: s.site.code,
        isDefault: s.isDefault,
      }));
    }

    const passkeysEnabledDto = await this.settingsService.get(
      'auth.passkeys.enabled',
    );
    const passkeysEnabled = String(passkeysEnabledDto.value) === 'true';

    let passkeyPolicy: 'disabled' | 'optional' | 'required' = 'disabled';

    if (passkeysEnabled) {
      passkeyPolicy = 'optional';
      let isRequired = false;
      if (user.role === 'SUPER_ADMIN') {
        const adminReq = await this.settingsService.get(
          'auth.requirements.admin.passkeys',
        );
        const adminEnf = await this.settingsService.get(
          'security.enforcement.passkeys.admin',
        );
        isRequired =
          String(adminReq.value) === 'true' ||
          String(adminEnf.value) === 'true';
      } else if (user.role === 'MANAGER') {
        const managerEnf = await this.settingsService.get(
          'security.enforcement.passkeys.manager',
        );
        const userReq = await this.settingsService.get(
          'auth.requirements.user.passkeys',
        );
        isRequired =
          String(managerEnf.value) === 'true' ||
          String(userReq.value) === 'true';
      } else if (user.role === 'GUEST') {
        const guestReq = await this.settingsService.get(
          'auth.requirements.guest.passkeys',
        );
        const guestEnf = await this.settingsService.get(
          'security.enforcement.passkeys.guest',
        );
        isRequired =
          String(guestReq.value) === 'true' ||
          String(guestEnf.value) === 'true';
      } else {
        const userReq = await this.settingsService.get(
          'auth.requirements.user.passkeys',
        );
        const userEnf = await this.settingsService.get(
          'security.enforcement.passkeys.user',
        );
        isRequired =
          String(userReq.value) === 'true' || String(userEnf.value) === 'true';
      }

      if (isRequired) {
        passkeyPolicy = 'required';
      }
    }

    const hasPasskey = user.passkeys && user.passkeys.length > 0;

    const session = {
      id: user.id,
      username: user.username,
      fullname: user.fullname,
      role: user.role,
      groups: user.groupMemberships.map((m) => m.group.name),
      groupIds: user.groupMemberships.map((m) => m.group.id),
      mustChangePassword: user.mustChangePassword,
      sites: sitesResult,
      passkeysEnabled,
      passkeyPolicy,
      hasPasskey,
    };

    try {
      // Expires in 60 seconds
      await this.redis.set(cacheKey, JSON.stringify(session), 'EX', 60);
    } catch (error) {
      this.logger.warn(`Redis error saving session: ${error.message}`);
    }

    return session;
  }

  private async invalidateSession(userId: number): Promise<void> {
    try {
      await this.redis.del(`session:${userId}`);
    } catch (error) {
      this.logger.warn(`Redis error invalidating session: ${error.message}`);
    }
  }
}
