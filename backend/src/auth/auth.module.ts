import { Module, forwardRef, Global } from '@nestjs/common';
import { makeCounterProvider } from '@willsoto/nestjs-prometheus';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { ApiKeysController } from './api-keys.controller';
import { MfaController } from './mfa.controller';
import { RefreshTokenService } from './refresh-token.service';
import { JwtStrategy } from './strategies';
import { ApiKeysService } from './api-keys.service';
import { ApiKeyStrategy } from './strategies/api-key.strategy';
import { SettingsModule } from '../settings/settings.module';
import { MfaService } from './mfa.service';
import { PasskeysController } from './passkeys.controller';
import { PasskeysService } from './passkeys.service';
import { LdapService } from './ldap.service';
import { OidcService } from './oidc.service';
import { AzureAdService } from './azure-ad.service';
import { SamlService } from './saml.service';
import { AuthRateLimitGuard } from './guards/auth-rate-limit.guard';
import { Reflector } from '@nestjs/core';
/**
 * Authentication Module.
 *
 * Provides:
 * - JWT-based authentication with short-lived access tokens (15 min)
 * - Secure refresh token storage with rotation
 * - Local user authentication with bcrypt
 * - Password management
 *
 * Security decisions:
 * - Access tokens: 15 minutes (in-memory only)
 * - Refresh tokens: 7 days, SHA-256 hashed in DB, rotated on use
 * - Token theft detection via family-based rotation tracking
 */
@Global()
@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('AUTH_SECRET'),
        signOptions: {
          expiresIn: '15m',
        },
      }),
    }),
    forwardRef(() => SettingsModule),
  ],
  controllers: [AuthController, MfaController, PasskeysController, ApiKeysController],
  providers: [
    AuthService,
    LdapService,
    OidcService,
    AzureAdService,
    SamlService,
    MfaService,
    PasskeysService,
    RefreshTokenService,
    JwtStrategy,
    ApiKeysService,
    ApiKeyStrategy,
    makeCounterProvider({
      name: 'auth_refresh_success_total',
      help: 'Total number of successful token refreshes',
    }),
    makeCounterProvider({
      name: 'auth_refresh_failure_total',
      help: 'Total number of failed token refreshes',
      labelNames: ['reason'],
    }),
    makeCounterProvider({
      name: 'auth_refresh_reuse_in_grace_total',
      help: 'Total number of concurrent token reuse attempts within grace window',
    }),
    makeCounterProvider({
      name: 'auth_refresh_reuse_out_of_grace_total',
      help: 'Total number of token reuse attempts outside grace window (suspected replays)',
    }),
    makeCounterProvider({
      name: 'auth_refresh_revoke_family_total',
      help: 'Total number of token families revoked due to suspected theft',
    }),
    Reflector,
    AuthRateLimitGuard,
  ],
  exports: [
    AuthService,
    RefreshTokenService,
    JwtModule,
    ApiKeysService,
    PasskeysService,
    LdapService,
    OidcService,
    AzureAdService,
    SamlService,
  ],
})
export class AuthModule { }
