import {
  Injectable,
  Logger,
  BadRequestException,
  UnauthorizedException,
  Inject,
} from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';
import { Issuer, Client, TokenSet, generators } from 'openid-client';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../common/redis/redis.module';
import { randomBytes } from 'crypto';

export interface OidcProfile {
  username: string;
  email: string;
  fullname: string;
}

interface OidcClientCacheEntry {
  client: Client;
  issuer: string;
  clientId: string;
  clientSecret: string;
}

const SSO_TICKET_TTL = 60;
const STATE_TTL = 300;

@Injectable()
export class OidcService {
  private readonly logger = new Logger(OidcService.name);
  private cachedClients: Record<string, OidcClientCacheEntry> = {};

  constructor(
    private readonly settingsService: SettingsService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async getClient(provider: string): Promise<Client> {
    if (provider === 'google') return this.getGoogleClient();
    if (provider !== 'generic') {
      throw new BadRequestException(`Unknown OIDC provider: ${provider}`);
    }

    const enabled = await this.settingsService.getRawValue(
      'auth.generic.enabled',
    );
    if (enabled !== 'true' && enabled !== true)
      throw new BadRequestException('Generic OIDC provider is disabled');

    const issuerUrl = String(
      await this.settingsService.getRawValue('auth.generic.oidc.issuer'),
    );
    const clientId = String(
      await this.settingsService.getRawValue('auth.generic.oidc.clientId'),
    );
    const clientSecret = String(
      await this.settingsService.getRawValue('auth.generic.oidc.clientSecret'),
    );

    return this.resolveClient(provider, issuerUrl, clientId, clientSecret);
  }

  async getGoogleClient(): Promise<Client> {
    const enabled = await this.settingsService.getRawValue(
      'auth.google.enabled',
    );
    if (enabled !== 'true' && enabled !== true)
      throw new BadRequestException('Google OIDC provider is disabled');

    const issuerUrl = 'https://accounts.google.com';
    const clientId = String(
      await this.settingsService.getRawValue('auth.google.clientId'),
    );
    const clientSecret = String(
      await this.settingsService.getRawValue('auth.google.clientSecret'),
    );

    return this.resolveClient('google', issuerUrl, clientId, clientSecret);
  }

  private async resolveClient(
    provider: string,
    issuerUrl: string,
    clientId: string,
    clientSecret: string,
  ): Promise<Client> {
    if (
      !issuerUrl ||
      !clientId ||
      !clientSecret ||
      issuerUrl === 'undefined' ||
      clientId === 'undefined' ||
      clientSecret === 'undefined'
    ) {
      throw new BadRequestException(
        `Missing configuration for provider: ${provider}`,
      );
    }

    const cached = this.cachedClients[provider];

    // Cache invalidation: rebuild if config changed
    if (
      cached &&
      cached.issuer === issuerUrl &&
      cached.clientId === clientId &&
      cached.clientSecret === clientSecret
    ) {
      return cached.client;
    }

    try {
      this.logger.log(
        `Discovering OIDC issuer for provider '${provider}': ${issuerUrl}`,
      );
      const issuer = await Issuer.discover(issuerUrl);
      const client = new issuer.Client({
        client_id: clientId,
        client_secret: clientSecret,
        response_types: ['code'],
      });
      this.cachedClients[provider] = {
        client,
        issuer: issuerUrl,
        clientId,
        clientSecret,
      };
      return client;
    } catch (e) {
      delete this.cachedClients[provider];
      this.logger.error(`Failed to configure OIDC client for ${provider}`, e);
      throw new BadRequestException(
        'Invalid OIDC configuration or unreachable issuer',
      );
    }
  }

  // state + nonce are generated and stored server-side in Redis
  async getLoginUrl(provider: string, redirectUri: string): Promise<string> {
    const client = await this.getClient(provider);

    let scopes = 'openid email profile';
    if (provider === 'generic') {
      const configuredScopes = await this.settingsService.getRawValue(
        'auth.generic.oidc.scopes',
      );
      if (configuredScopes && configuredScopes !== 'undefined') {
        scopes = configuredScopes as string;
      }
    }

    const state = generators.state();
    const nonce = generators.nonce();

    await this.redis.set(
      `oidc:state:${state}`,
      JSON.stringify({ nonce, redirectUri }),
      'EX',
      STATE_TTL,
    );

    const authParams: Record<string, string> = {
      scope: scopes,
      redirect_uri: redirectUri,
      state,
      nonce,
    };

    if (provider === 'google') {
      const hostedDomain = await this.settingsService.getRawValue(
        'auth.google.hostedDomain',
      );
      if (hostedDomain && hostedDomain !== 'undefined' && hostedDomain !== '') {
        authParams.hd = String(hostedDomain);
      }
    }

    const url = client.authorizationUrl(authParams);
    return url;
  }

  async handleCallback(
    provider: string,
    redirectUri: string,
    reqHtmlUrl: string,
  ): Promise<OidcProfile> {
    const client = await this.getClient(provider);
    const params = client.callbackParams(reqHtmlUrl);

    if (Object.keys(params).length === 0) {
      throw new BadRequestException('No callback parameters found');
    }

    const state = params.state;
    if (!state) {
      throw new BadRequestException('Missing state parameter');
    }

    const stored = await this.redis.get(`oidc:state:${state}`);
    if (!stored) {
      throw new UnauthorizedException('Invalid or expired OIDC state');
    }

    // One-time consumption
    await this.redis.del(`oidc:state:${state}`);

    const parsedStored = JSON.parse(stored) as {
      nonce: string;
      redirectUri: string;
    };
    const nonce = parsedStored.nonce;
    const storedRedirectUri = parsedStored.redirectUri;

    // Prevent redirect_uri manipulation
    if (storedRedirectUri !== redirectUri) {
      this.logger.warn(
        `[OIDC_ERROR_REDIRECT_MISMATCH] OIDC redirect_uri mismatch prevented.`,
      );
      throw new UnauthorizedException('OIDC redirect_uri mismatch');
    }

    try {
      const tokenSet: TokenSet = await client.callback(redirectUri, params, {
        state,
        nonce,
      });

      const claims = tokenSet.claims();

      if (!claims.email) {
        this.logger.error(
          '[OIDC_ERROR_MISSING_EMAIL] No email provided from OIDC IdP',
        );
        throw new UnauthorizedException('No email provided from OIDC IdP');
      }

      if ('email_verified' in claims && claims.email_verified !== true) {
        this.logger.warn(
          `[OIDC_ERROR_UNVERIFIED_EMAIL] Email ${claims.email} is not verified by IdP`,
        );
        throw new UnauthorizedException(
          'Email is not verified by Identity Provider',
        );
      }

      if (provider === 'google') {
        const hostedDomain = await this.settingsService.getRawValue(
          'auth.google.hostedDomain',
        );
        if (
          hostedDomain &&
          hostedDomain !== 'undefined' &&
          hostedDomain !== ''
        ) {
          const domain = claims.email.split('@')[1];
          if (domain !== String(hostedDomain)) {
            throw new UnauthorizedException(
              `Email domain is not allowed. Hosted domain restriction: ${hostedDomain}`,
            );
          }
        }
      }

      const rawUsername =
        claims.preferred_username || claims.email?.split('@')[0];
      return {
        email: claims.email,
        username: rawUsername.trim().toLowerCase(),
        fullname: claims.name || claims.email,
      };
    } catch (e) {
      if (
        e instanceof UnauthorizedException ||
        e instanceof BadRequestException
      )
        throw e;
      this.logger.error(
        `[OIDC_ERROR_CALLBACK_FAILURE] OIDC Callback error for provider ${provider}: ${e instanceof Error ? e.message : 'Unknown error'}`,
      );
      throw new UnauthorizedException('Invalid or expired SSO login session');
    }
  }

  // SSO ticket: one-time token stored in Redis, TTL 60s
  async createSsoTicket(data: {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  }): Promise<string> {
    const ticket = randomBytes(32).toString('hex');
    await this.redis.set(
      `sso_ticket:${ticket}`,
      JSON.stringify(data),
      'EX',
      SSO_TICKET_TTL,
    );
    return ticket;
  }

  async consumeSsoTicket(
    ticket: string,
  ): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
    const key = `sso_ticket:${ticket}`;
    const raw = await this.redis.get(key);
    if (!raw) {
      throw new UnauthorizedException('Invalid or expired SSO ticket');
    }
    await this.redis.del(key);
    return JSON.parse(raw) as {
      accessToken: string;
      refreshToken: string;
      expiresIn: number;
    };
  }
}
