import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

export interface UserSitePayload {
  siteId: number;
  siteName: string;
  siteCode: string;
  isDefault: boolean;
}

export interface JwtPayload {
  id?: number;
  sub: number;
  username: string;
  role: string;
  groups: string[];
  groupIds: number[];
  sites: UserSitePayload[];
  iat?: number;
  exp?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    const secret = configService.get<string>('AUTH_SECRET');

    if (!secret) {
      throw new Error('AUTH_SECRET is not defined');
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  validate(payload: JwtPayload): JwtPayload {
    return {
      id: payload.sub,
      sub: payload.sub,
      username: payload.username,
      role: payload.role,
      groups: payload.groups || [],
      groupIds: payload.groupIds || [],
      sites: payload.sites || [],
    };
  }
}
