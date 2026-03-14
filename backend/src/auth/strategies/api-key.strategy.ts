import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { HeaderAPIKeyStrategy } from 'passport-headerapikey';
import { ApiKeysService } from '../api-keys.service';
import { AuthService } from '../auth.service';

@Injectable()
export class ApiKeyStrategy extends PassportStrategy(
  HeaderAPIKeyStrategy as any,
  'api-key',
) {
  constructor(
    private apiKeysService: ApiKeysService,
    private authService: AuthService,
  ) {
    super(
      { header: 'X-API-KEY', prefix: '' },
      false,
      async (
        apiKey: string,
        done: (err: Error | null, user?: any, info?: any) => void,
      ) => {
        return this.validate(apiKey, done);
      },
    );
  }

  async validate(
    apiKey: string,
    verified: (err: Error | null, user?: any, info?: any) => void,
  ) {
    try {
      const keyEntity = await this.apiKeysService.validateKey(apiKey);
      if (!keyEntity) {
        return verified(null, false);
      }

      // Map ApiKey to a "User-like" principal
      const principal = {
        id: `apikey:${keyEntity.id}`,
        sub: `apikey:${keyEntity.id}`,
        username: `API Key (${keyEntity.keyPrefix}...)`,
        role: 'API_KEY', // Special role
        permissions: keyEntity.scopes,
        isApiKey: true,
      };

      return verified(null, principal);
    } catch (error) {
      return verified(error);
    }
  }
}
