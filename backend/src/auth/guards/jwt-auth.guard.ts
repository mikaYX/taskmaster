import {
  Injectable,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ClsService } from 'nestjs-cls';
import { Reflector } from '@nestjs/core';
import { AuthService } from '../auth.service';
import { IS_PASSKEY_EXEMPT_KEY } from '../decorators/passkey-exempt.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(
    private readonly cls: ClsService,
    private readonly reflector: Reflector,
    private readonly authService: AuthService,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const allowed = await super.canActivate(context);
    if (allowed) {
      const req = context.switchToHttp().getRequest();
      if (req.user) {
        this.cls.set('user', req.user);
      }
      const siteHeader = req.headers['x-site-id'];
      if (siteHeader) {
        const parsed = parseInt(String(siteHeader), 10);
        if (!isNaN(parsed)) {
          this.cls.set('selectedSiteId', parsed);
        }
      }

      // Enforcement Passkey "Hard" Backend
      const isExempt = this.reflector.getAllAndOverride<boolean>(
        IS_PASSKEY_EXEMPT_KEY,
        [context.getHandler(), context.getClass()],
      );

      if (!isExempt && req.user && req.user.sub) {
        const sessionInfos = await this.authService.getSession(req.user.sub);
        if (
          sessionInfos &&
          sessionInfos.passkeyPolicy === 'required' &&
          !sessionInfos.hasPasskey
        ) {
          throw new ForbiddenException({
            statusCode: 403,
            message:
              'Passkey configuration is required to access this resource.',
            code: 'PASSKEY_REQUIRED',
          });
        }
      }
    }
    return allowed as boolean;
  }
}
