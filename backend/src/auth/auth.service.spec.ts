import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma';
import { JwtService } from '@nestjs/jwt';
import { RefreshTokenService } from './refresh-token.service';
import { MfaService } from './mfa.service';
import { LdapService } from './ldap.service';
import { REDIS_CLIENT } from '../common/redis/redis.module';
import { UnauthorizedException, Logger } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';
import * as bcrypt from 'bcrypt';

jest.mock('bcrypt');

describe('AuthService', () => {
  let service: AuthService;
  let prismaClient: any;
  let ldapService: jest.Mocked<LdapService>;
  let jwtService: jest.Mocked<JwtService>;
  let mockRedis: any;
  let mockSettingsService: any;

  beforeEach(async () => {
    prismaClient = {
      user: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };

    const mockLdapService = {
      authenticate: jest.fn(),
    };

    const mockJwtService = {
      sign: jest.fn().mockReturnValue('token'),
      signAsync: jest.fn().mockResolvedValue('token'),
      verify: jest.fn(),
    };

    const mockRefreshTokenService = {
      createToken: jest
        .fn()
        .mockResolvedValue({ token: 'rt', expiresAt: new Date() }),
      revokeAllTokensForUser: jest.fn().mockResolvedValue(undefined),
    };

    mockRedis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
      incr: jest.fn().mockResolvedValue(1),
      expire: jest.fn().mockResolvedValue(1),
    };

    mockSettingsService = {
      get: jest.fn().mockResolvedValue({ value: 'false' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: { client: prismaClient } },
        { provide: JwtService, useValue: mockJwtService },
        { provide: RefreshTokenService, useValue: mockRefreshTokenService },
        {
          provide: MfaService,
          useValue: {
            getUserSecret: jest.fn(),
            verifyMfa: jest.fn().mockResolvedValue(true),
          },
        },
        { provide: LdapService, useValue: mockLdapService },
        { provide: SettingsService, useValue: mockSettingsService },
        { provide: REDIS_CLIENT, useValue: mockRedis },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    ldapService = module.get(LdapService);
    jwtService = module.get(JwtService);

    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => {});
  });

  describe('login() with LDAP and JIT', () => {
    it('should authenticate via LDAP and JIT create new user', async () => {
      ldapService.authenticate.mockResolvedValue({
        username: 'newldap',
        email: 'newldap@example.com',
        fullname: 'New Ldap User',
      });
      const newUser = {
        id: 1,
        username: 'newldap',
        role: 'USER',
        groupMemberships: [],
      };
      prismaClient.user.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(newUser);
      prismaClient.user.create.mockResolvedValue(newUser);

      const result = await service.login('newLdap ', 'pass');

      // Normalized username
      expect(ldapService.authenticate).toHaveBeenCalledWith('newldap', 'pass');
      expect(prismaClient.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            username: 'newldap',
            email: 'newldap@example.com',
            fullname: 'New Ldap User',
            authProvider: 'LDAP',
            role: 'USER',
          },
        }),
      );
      expect(result).toHaveProperty('accessToken');
    });

    it('should authenticate via LDAP and update existing LDAP user', async () => {
      ldapService.authenticate.mockResolvedValue({
        username: 'oldldap',
        email: 'updated@example.com',
        fullname: 'Updated Name',
      });
      const oldUser = {
        id: 2,
        username: 'oldldap',
        authProvider: 'LDAP',
        groupMemberships: [],
      };
      prismaClient.user.findFirst.mockResolvedValue(oldUser);
      prismaClient.user.update.mockResolvedValue(oldUser);
      prismaClient.user.findUnique.mockResolvedValue(oldUser);

      await service.login('oldldap', 'pass');

      expect(prismaClient.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 2 },
          data: { email: 'updated@example.com', fullname: 'Updated Name' },
        }),
      );
    });

    it('should throw UnauthorizedException on LDAP account collision (user exists but is not LDAP)', async () => {
      ldapService.authenticate.mockResolvedValue({
        username: 'localadmin',
        email: 'admin@example.com',
        fullname: 'Admin',
      });
      prismaClient.user.findFirst.mockResolvedValue({
        id: 1,
        username: 'localadmin',
        authProvider: 'LOCAL',
      });

      await expect(service.login('localadmin', 'pass')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should fallback to LOCAL auth when LDAP fails/is disabled and user exists as LOCAL', async () => {
      ldapService.authenticate.mockResolvedValue(null);
      const localUser = {
        id: 3,
        username: 'localuser',
        authProvider: 'LOCAL',
        passwordHash: 'hashedpass',
        groupMemberships: [],
      };
      prismaClient.user.findFirst.mockResolvedValue(localUser);
      prismaClient.user.findUnique.mockResolvedValue(localUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.login('localuser', 'pass');

      expect(bcrypt.compare).toHaveBeenCalledWith('pass', 'hashedpass');
      expect(result).toHaveProperty('accessToken');
      // Lockout gets reset on success
      expect(mockRedis.del).toHaveBeenCalled();
    });

    it('should not reset lockout counters if user requires MFA', async () => {
      ldapService.authenticate.mockResolvedValue(null);
      const mfaUser = {
        id: 5,
        username: 'mfauser',
        authProvider: 'LOCAL',
        passwordHash: 'hashedpass',
        groupMemberships: [],
        mfaEnabled: true,
      };
      prismaClient.user.findFirst.mockResolvedValue(mfaUser);
      prismaClient.user.findUnique.mockResolvedValue(mfaUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.login('mfauser', 'pass');

      expect(bcrypt.compare).toHaveBeenCalledWith('pass', 'hashedpass');
      expect(result).toHaveProperty('requiresMfa', true);
      // Ensure lockout is not reset during initial login
      expect(mockRedis.del).not.toHaveBeenCalledWith(
        expect.stringContaining('lockout'),
      );

      // Now verify that MFA login DOES reset it
      jwtService.verify.mockReturnValue({
        sub: 5,
        username: 'mfauser',
        type: 'mfa_pending',
      });
      await service.verifyMfaLogin(
        'mfauser',
        'valid-token',
        'agent',
        '127.0.0.1',
      );
      expect(mockRedis.del).toHaveBeenCalledWith(
        expect.stringContaining('lockout'),
      );
    });

    it('should reject local fallback if user provider is not LOCAL', async () => {
      ldapService.authenticate.mockResolvedValue(null);
      prismaClient.user.findFirst.mockResolvedValue({
        id: 4,
        username: 'ldaponly',
        authProvider: 'LDAP', // Not LOCAL
      });

      await expect(service.login('ldaponly', 'pass')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('loginOidc() username normalization', () => {
    it('should use normalized username for both lookup and create', async () => {
      const profile = {
        username: ' OidcUser ',
        email: 'oidc@example.com',
        fullname: 'OIDC User',
      };

      const createdUser = {
        id: 10,
        username: 'oidcuser',
        role: 'USER',
        groupMemberships: [],
        mustChangePassword: false,
      };

      // findFirst returns null (new user) then returns createdUser for completeLogin
      prismaClient.user.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(createdUser);
      prismaClient.user.create.mockResolvedValue(createdUser);

      const result = await service.loginOidc(profile);

      // Lookup should use normalized username
      expect(prismaClient.user.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            username: 'oidcuser',
          }),
        }),
      );
      // Create should use normalized username, not raw
      expect(prismaClient.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            username: 'oidcuser',
            authProvider: 'OIDC',
          }),
        }),
      );
      expect(result).toHaveProperty('accessToken');
    });

    it('should update existing OIDC user profile on login', async () => {
      const profile = {
        username: 'existingOidc',
        email: 'updated@example.com',
        fullname: 'Updated Name',
      };

      const existingUser = {
        id: 11,
        username: 'existingoidc',
        authProvider: 'OIDC',
        role: 'USER',
        groupMemberships: [],
        mustChangePassword: false,
      };

      prismaClient.user.findFirst
        .mockResolvedValueOnce(existingUser)
        .mockResolvedValueOnce(existingUser);
      prismaClient.user.update.mockResolvedValue(existingUser);

      await service.loginOidc(profile);

      expect(prismaClient.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 11 },
          data: { email: 'updated@example.com', fullname: 'Updated Name' },
        }),
      );
    });

    it('should reject OIDC login if user exists with different authProvider', async () => {
      const profile = {
        username: 'localUser',
        email: 'local@example.com',
        fullname: 'Local User',
      };

      prismaClient.user.findFirst.mockResolvedValue({
        id: 12,
        username: 'localuser',
        authProvider: 'LOCAL',
      });

      await expect(service.loginOidc(profile)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('getSession with passkey enforcement logic', () => {
    const mockUserBase = {
      id: 1,
      username: 'testuser',
      fullname: 'Test User',
      role: 'USER',
      mustChangePassword: false,
      groupMemberships: [],
      sites: [],
      passkeys: [],
    };

    beforeEach(() => {
      mockSettingsService.get.mockImplementation(async (key: string) => {
        if (key === 'auth.passkeys.enabled') return { value: 'true' };
        return { value: 'false' };
      });
    });

    it('rebuilds cached sessions from before the password renewal field existed', async () => {
      mockRedis.get.mockResolvedValue(
        JSON.stringify({ id: 1, role: 'USER', passkeyPolicy: 'disabled' }),
      );
      prismaClient.user.findFirst.mockResolvedValue({
        ...mockUserBase,
        mustChangePassword: true,
      });
      expect((await service.getSession(1))?.mustChangePassword).toBe(true);
      expect(prismaClient.user.findFirst).toHaveBeenCalled();
    });
    it('invalidates a previously cached session at successful login', async () => {
      prismaClient.user.findFirst.mockResolvedValue({
        ...mockUserBase,
        mustChangePassword: true,
      });
      expect((await service.completeLogin(1)).mustChangePassword).toBe(true);
      expect(mockRedis.del).toHaveBeenCalledWith('session:1');
    });
    it('should return passkeysEnabled=false if auth.passkeys.enabled is false', async () => {
      prismaClient.user.findFirst.mockResolvedValue(mockUserBase);
      mockSettingsService.get.mockResolvedValue({ value: 'false' });

      const session = await service.getSession(1);
      expect(session).toMatchObject({
        passkeysEnabled: false,
        passkeyPolicy: 'disabled',
        hasPasskey: false,
      });
    });

    it('should return passkeyPolicy=optional for USER by default when passkeys are enabled', async () => {
      prismaClient.user.findFirst.mockResolvedValue(mockUserBase);

      const session = await service.getSession(1);
      expect(session).toMatchObject({
        passkeyPolicy: 'optional',
      });
    });

    it('should return passkeyPolicy=required for USER if security.enforcement.passkeys.user is true', async () => {
      prismaClient.user.findFirst.mockResolvedValue(mockUserBase);
      mockSettingsService.get.mockImplementation(async (key: string) => {
        if (key === 'auth.passkeys.enabled') return { value: 'true' };
        if (key === 'security.enforcement.passkeys.user')
          return { value: 'true' };
        return { value: 'false' };
      });

      const session = await service.getSession(1);
      expect(session).toMatchObject({
        passkeyPolicy: 'required',
      });
    });

    it('should resolve anti-conflict for MANAGER: required if userReq is true', async () => {
      prismaClient.user.findFirst.mockResolvedValue({
        ...mockUserBase,
        role: 'MANAGER',
      });
      mockSettingsService.get.mockImplementation(async (key: string) => {
        if (key === 'auth.passkeys.enabled') return { value: 'true' };
        if (key === 'auth.requirements.user.passkeys') return { value: 'true' };
        return { value: 'false' };
      });

      const session = await service.getSession(1);
      expect(session).toMatchObject({
        passkeyPolicy: 'required',
      });
    });

    it('never applies a passkey policy to a GUEST (TV screens cannot hold one), even when required', async () => {
      prismaClient.user.findFirst.mockResolvedValue({
        ...mockUserBase,
        role: 'GUEST',
      });
      mockSettingsService.get.mockImplementation(async (key: string) => {
        if (key === 'auth.passkeys.enabled') return { value: 'true' };
        if (
          key === 'auth.requirements.guest.passkeys' ||
          key === 'security.enforcement.passkeys.guest'
        )
          return { value: 'true' };
        return { value: 'false' };
      });

      const session = await service.getSession(1);
      expect(session).toMatchObject({
        passkeyPolicy: 'disabled',
      });
    });

    it('should return hasPasskey=true if user has configured passkeys', async () => {
      prismaClient.user.findFirst.mockResolvedValue({
        ...mockUserBase,
        passkeys: [{ id: 'pk-123' }],
      });

      const session = await service.getSession(1);
      expect(session).toMatchObject({
        hasPasskey: true,
        passkeyPolicy: 'optional', // default from mockSettings
      });
    });
  });

  describe('session length handed to the cookie', () => {
    const liveUser = (role: string) => ({
      id: 4,
      username: 'someone',
      role,
      mustChangePassword: false,
      groupMemberships: [],
      sites: [],
    });

    it('passes the role to the token store and returns the real expiry of the refresh token', async () => {
      const expiresAt = new Date(Date.now() + 1440 * 60_000);
      const refreshTokens = (service as any).refreshTokenService;
      refreshTokens.createToken.mockResolvedValue({ token: 'rt', expiresAt });
      prismaClient.user.findFirst.mockResolvedValue(liveUser('MANAGER'));

      const result = await service.completeLogin(4, 'ua', '10.0.0.1');

      expect(refreshTokens.createToken).toHaveBeenCalledWith(
        4,
        'ua',
        '10.0.0.1',
        undefined,
        'MANAGER',
      );
      expect(result.refreshExpiresAt).toBe(expiresAt);
    });

    it('returns the expiry of the rotated token on refresh', async () => {
      const expiresAt = new Date(Date.now() + 1440 * 60_000);
      const refreshTokens = (service as any).refreshTokenService;
      refreshTokens.rotateToken = jest
        .fn()
        .mockResolvedValue({ token: 'rt2', expiresAt, userId: 4 });
      prismaClient.user.findFirst.mockResolvedValue(liveUser('USER'));

      const result = await service.refreshTokens('rt1');

      expect(result.refreshToken).toBe('rt2');
      expect(result.refreshExpiresAt).toBe(expiresAt);
    });
  });

  describe('the screen of a TV account', () => {
    const claimsOf = (callIndex = 0) =>
      (jwtService.sign as jest.Mock).mock.calls[callIndex][0];

    it('is carried by the access token of a guest, defaulting to the board', () => {
      service.generateAccessToken(9, 'tv', 'GUEST', [], [], [], 'ANALYTICS');
      service.generateAccessToken(9, 'tv', 'GUEST', [], [], [], null);
      service.generateAccessToken(9, 'tv', 'GUEST', [], [], []);

      expect(claimsOf(0).guestView).toBe('ANALYTICS');
      expect(claimsOf(1).guestView).toBe('DASHBOARD');
      expect(claimsOf(2).guestView).toBe('DASHBOARD');
    });

    it('is never put in the token of anyone else', () => {
      service.generateAccessToken(
        2,
        'boss',
        'MANAGER',
        [],
        [],
        [],
        'ANALYTICS',
      );

      expect(claimsOf(0)).not.toHaveProperty('guestView');
    });

    it('is returned with the session so the web app can open the right screen', async () => {
      prismaClient.user.findFirst.mockResolvedValue({
        id: 9,
        username: 'tv',
        fullname: 'TV',
        role: 'GUEST',
        guestView: 'ANALYTICS',
        mustChangePassword: false,
        groupMemberships: [],
        sites: [],
        passkeys: [],
      });

      await expect(service.getSession(9)).resolves.toMatchObject({
        guestView: 'ANALYTICS',
      });
    });

    it('is the board for a guest without a screen (account from before screens existed)', async () => {
      prismaClient.user.findFirst.mockResolvedValue({
        id: 9,
        username: 'tv',
        fullname: 'TV',
        role: 'GUEST',
        guestView: null,
        mustChangePassword: false,
        groupMemberships: [],
        sites: [],
        passkeys: [],
      });

      await expect(service.getSession(9)).resolves.toMatchObject({
        guestView: 'DASHBOARD',
      });
    });

    it('is null for every other role', async () => {
      prismaClient.user.findFirst.mockResolvedValue({
        id: 2,
        username: 'u',
        fullname: 'U',
        role: 'USER',
        guestView: null,
        mustChangePassword: false,
        groupMemberships: [],
        sites: [],
        passkeys: [],
      });

      await expect(service.getSession(2)).resolves.toMatchObject({
        guestView: null,
      });
    });
  });

  describe('changePassword()', () => {
    const localUser = {
      id: 7,
      deletedAt: null,
      authProvider: 'LOCAL',
      passwordHash: 'old-hash',
    };

    beforeEach(() => {
      prismaClient.user.findUnique.mockResolvedValue(localUser);
      prismaClient.user.update.mockResolvedValue({});
      (bcrypt.hash as jest.Mock).mockResolvedValue('new-hash');
    });

    it('rejects a wrong current password without touching the hash', async () => {
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.changePassword(7, 'NewPassw0rd!!x', 'wrong'),
      ).rejects.toThrow('Current password is incorrect');
      expect(prismaClient.user.update).not.toHaveBeenCalled();
    });

    it('rejects a new password identical to the current one', async () => {
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await expect(
        service.changePassword(7, 'SamePassw0rd!!', 'SamePassw0rd!!'),
      ).rejects.toThrow('must be different');
      expect(prismaClient.user.update).not.toHaveBeenCalled();
    });

    it('stores the new hash and clears mustChangePassword', async () => {
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await service.changePassword(7, 'NewPassw0rd!!x', 'OldPassw0rd!!x');

      expect(bcrypt.compare).toHaveBeenCalledWith('OldPassw0rd!!x', 'old-hash');
      expect(prismaClient.user.update).toHaveBeenCalledWith({
        where: { id: 7 },
        data: { passwordHash: 'new-hash', mustChangePassword: false },
      });
    });
  });
});
