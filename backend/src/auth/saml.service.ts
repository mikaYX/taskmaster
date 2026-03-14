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
import { SAML, SamlConfig, Profile } from '@node-saml/node-saml';
import * as crypto from 'crypto';

export interface SamlProfile {
  email: string;
  username: string;
  fullname: string;
  providerUserId: string;
}

const STATE_TTL = 300; // 5 mins

@Injectable()
export class SamlService {
  private readonly logger = new Logger(SamlService.name);

  constructor(
    private readonly settingsService: SettingsService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async getSamlConfig(): Promise<SamlConfig> {
    const callbackUrl = `${
      process.env.BACKEND_URL || 'http://localhost:3000'
    }/auth/saml/acs`;

    const entityId = String(
      await this.settingsService.getRawValue('auth.generic.saml.entityId'),
    );
    const ssoUrl = String(
      await this.settingsService.getRawValue('auth.generic.saml.ssoUrl'),
    );
    const x509Raw = String(
      await this.settingsService.getRawValue('auth.generic.saml.x509'),
    );

    if (
      !entityId ||
      !ssoUrl ||
      !x509Raw ||
      entityId === 'undefined' ||
      ssoUrl === 'undefined' ||
      x509Raw === 'undefined' ||
      entityId === 'null' ||
      ssoUrl === 'null' ||
      x509Raw === 'null'
    ) {
      throw new BadRequestException('SAML provider is not fully configured');
    }

    return {
      callbackUrl,
      entryPoint: ssoUrl,
      issuer: entityId,
      idpCert: x509Raw,
      wantAssertionsSigned: true,
      wantAuthnResponseSigned: true,
      signatureAlgorithm: 'sha256',
    };
  }

  async getSamlInstance(): Promise<SAML> {
    const config = await this.getSamlConfig();
    return new SAML(config);
  }

  async getSpMetadata(): Promise<string> {
    const saml = await this.getSamlInstance();
    // Pass null for decryptionCert and signingCert as we don't sign/encrypt requests by default
    return saml.generateServiceProviderMetadata(null, null);
  }

  async getLoginUrl(relayState?: string): Promise<string> {
    const saml = await this.getSamlInstance();

    let state = relayState;
    if (relayState) {
      state = crypto.randomBytes(32).toString('hex');
      await this.redis.set(
        `saml-relay-state:${state}`,
        relayState,
        'EX',
        STATE_TTL,
      );
    }

    return saml.getAuthorizeUrlAsync(state || '', '', {});
  }

  async validateResponse(
    samlResponse: string,
    relayState?: string,
  ): Promise<SamlProfile> {
    const saml = await this.getSamlInstance();

    let profile: Profile | null | undefined;
    try {
      const response = await saml.validatePostResponseAsync({
        SAMLResponse: samlResponse,
      });
      profile = response.profile;

      if (!profile) {
        throw new Error('No profile extracted');
      }
    } catch (e) {
      this.logger.error(
        `[SAML_ERROR] Validation error: ${
          e instanceof Error ? e.message : 'Unknown error'
        }`,
      );
      throw new UnauthorizedException('Invalid SAML Response');
    }

    const entityId = String(
      await this.settingsService.getRawValue('auth.generic.saml.entityId'),
    );

    const normalizedProfile = this.normalizeProfile(profile);

    this.logger.log(
      `[SAML_SUCCESS] Successful authentication for ${normalizedProfile.email} from issuer ${entityId}`,
    );

    return normalizedProfile;
  }

  normalizeProfile(profile: any): SamlProfile {
    const getAttr = (names: string[]): string | undefined => {
      for (const name of names) {
        const foundKey = Object.keys(profile).find(
          (k) => k.toLowerCase() === name.toLowerCase(),
        );
        if (foundKey && profile[foundKey]) {
          const value = profile[foundKey];
          // node-saml can sometimes parse arrays if multiple values exist
          return Array.isArray(value) ? value[0] : String(value);
        }
      }
      return undefined;
    };

    const email = getAttr([
      'email',
      'mail',
      'emailaddress',
      'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress',
    ]);

    if (!email) {
      this.logger.error(
        '[SAML_ERROR_MISSING_EMAIL] No email provided from SAML claims',
      );
      throw new UnauthorizedException(
        'No email provided from SAML Identity Provider',
      );
    }

    let displayName = getAttr([
      'displayname',
      'name',
      'http://schemas.microsoft.com/identity/claims/displayname',
    ]);

    if (!displayName) {
      const givenName = getAttr([
        'givenname',
        'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname',
      ]);
      const surname = getAttr([
        'surname',
        'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname',
      ]);
      if (givenName || surname) {
        displayName = `${givenName || ''} ${surname || ''}`.trim();
      }
    }

    // Usually 'nameID' or 'nameIDFormat' exist in the root of profile,
    // or as 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier'
    const providerUserId =
      profile.nameID ||
      profile.nameId ||
      getAttr([
        'nameidentifier',
        'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier',
      ]) ||
      email;

    const username = email.split('@')[0].trim().toLowerCase();

    return {
      email,
      username,
      fullname: displayName || email,
      providerUserId,
    };
  }
}
