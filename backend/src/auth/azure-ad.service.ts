import {
  Injectable,
  Logger,
  BadRequestException,
  UnauthorizedException,
  Inject,
} from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';
import { REDIS_CLIENT } from '../common/redis/redis.module';
import Redis from 'ioredis';
import { randomBytes } from 'crypto';
import {
  ConfidentialClientApplication,
  Configuration,
  LogLevel,
} from '@azure/msal-node';

export interface AzureAdProfile {
  email: string;
  username: string;
  fullname: string;
  providerUserId: string;
}

const STATE_TTL = 300; // 5 mins

@Injectable()
export class AzureAdService {
  private readonly logger = new Logger(AzureAdService.name);

  constructor(
    private readonly settingsService: SettingsService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async getClient(): Promise<ConfidentialClientApplication> {
    const enabled = await this.settingsService.getRawValue(
      'auth.azureAd.enabled',
    );
    if (enabled !== 'true' && enabled !== true) {
      throw new BadRequestException('Azure AD provider is disabled');
    }

    const tenantId = String(
      await this.settingsService.getRawValue('auth.azureAd.tenantId'),
    );
    const clientId = String(
      await this.settingsService.getRawValue('auth.azureAd.clientId'),
    );
    const clientSecret = String(
      await this.settingsService.getRawValue('auth.azureAd.clientSecret'),
    );

    if (
      !tenantId ||
      !clientId ||
      !clientSecret ||
      tenantId === 'undefined' ||
      clientId === 'undefined' ||
      clientSecret === 'undefined'
    ) {
      throw new BadRequestException('Missing configuration for Azure AD');
    }

    const authority = `https://login.microsoftonline.com/${tenantId}`;

    const config: Configuration = {
      auth: {
        clientId,
        authority,
        clientSecret,
      },
      system: {
        loggerOptions: {
          loggerCallback: (level, message, containsPii) => {
            if (containsPii) return;
            switch (level) {
              case LogLevel.Error:
                this.logger.error(message);
                break;
              case LogLevel.Warning:
                this.logger.warn(message);
                break;
              case LogLevel.Info:
                // this.logger.log(message); // MSAL info is too verbose
                break;
              case LogLevel.Verbose:
                break;
            }
          },
        },
      },
    };

    return new ConfidentialClientApplication(config);
  }

  async getLoginUrl(redirectUri: string): Promise<string> {
    const client = await this.getClient();

    const state = randomBytes(32).toString('hex');
    const nonce = randomBytes(32).toString('hex');

    await this.redis.set(
      `azure-state:${state}`,
      JSON.stringify({ nonce, redirectUri }),
      'EX',
      STATE_TTL,
    );

    const authCodeUrlParameters = {
      scopes: ['openid', 'email', 'profile'],
      redirectUri,
      state,
      nonce,
    };

    return client.getAuthCodeUrl(authCodeUrlParameters);
  }

  async handleCallback(
    code: string,
    state: string,
    redirectUri: string,
  ): Promise<AzureAdProfile> {
    if (!state) {
      throw new BadRequestException('Missing state parameter');
    }

    const stored = await this.redis.get(`azure-state:${state}`);
    if (!stored) {
      throw new UnauthorizedException('Invalid or expired Azure AD state');
    }

    await this.redis.del(`azure-state:${state}`);

    const parsedStored = JSON.parse(stored) as {
      nonce: string;
      redirectUri: string;
    };

    if (parsedStored.redirectUri !== redirectUri) {
      this.logger.warn(
        '[AZURE_AD_ERROR_REDIRECT_MISMATCH] redirect_uri mismatch prevented.',
      );
      throw new UnauthorizedException('Azure AD redirect_uri mismatch');
    }

    const client = await this.getClient();

    let tokenResponse;
    try {
      tokenResponse = await client.acquireTokenByCode({
        code,
        redirectUri,
        scopes: ['openid', 'email', 'profile'],
      });
    } catch (e) {
      this.logger.error(
        `[AZURE_AD_ERROR] acquireTokenByCode error: ${
          e instanceof Error ? e.message : 'Unknown error'
        }`,
      );
      throw new UnauthorizedException('Invalid or expired authorization code');
    }

    if (!tokenResponse || !tokenResponse.idTokenClaims) {
      throw new UnauthorizedException('No claims found in Azure AD response');
    }

    const profile = this.normalizeProfile(tokenResponse.idTokenClaims);

    const tenantId = String(
      await this.settingsService.getRawValue('auth.azureAd.tenantId'),
    );
    this.logger.log(
      `[AZURE_AD_SUCCESS] Successful authentication for ${profile.email} from tenant ${tenantId}`,
    );

    return profile;
  }

  normalizeProfile(idTokenClaims: Record<string, any>): AzureAdProfile {
    const email =
      idTokenClaims.preferred_username ||
      idTokenClaims.email ||
      idTokenClaims.upn;

    if (!email) {
      this.logger.error(
        '[AZURE_AD_ERROR_MISSING_EMAIL] No email provided from Azure AD claims',
      );
      throw new UnauthorizedException(
        'No email provided from Azure AD Identity Provider',
      );
    }

    const providerUserId = idTokenClaims.oid || idTokenClaims.sub;
    if (!providerUserId) {
      throw new UnauthorizedException(
        'No provider user ID (oid) found in claims',
      );
    }

    const displayName = idTokenClaims.name || email;
    const username = email.split('@')[0].trim().toLowerCase();

    return {
      email,
      username,
      fullname: displayName,
      providerUserId,
    };
  }
}
