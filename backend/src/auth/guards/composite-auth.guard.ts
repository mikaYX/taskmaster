import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ClsService } from 'nestjs-cls';

@Injectable()
export class CompositeAuthGuard extends AuthGuard(['jwt', 'api-key']) {
  constructor(private readonly cls: ClsService) {
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
    }
    return allowed as boolean;
  }
}
