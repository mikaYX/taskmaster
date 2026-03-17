import {
  Injectable,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../../prisma';

/**
 * CompositeAuthGuard — Handles JWT + API Key authentication.
 *
 * After authentication, this guard:
 * 1. Loads user's site assignments from database
 * 2. Validates the X-Site-Id header against those assignments
 * 3. Sets CLS context for downstream services (user, selectedSiteId)
 *
 * Security:
 * - SUPER_ADMIN and API_KEY users bypass X-Site-Id validation (global access)
 * - Regular users can only access sites they are assigned to
 * - Invalid or unauthorized X-Site-Id results in 403 Forbidden
 */
@Injectable()
export class CompositeAuthGuard extends AuthGuard(['jwt', 'api-key']) {
  private readonly logger = new Logger('CompositeAuthGuard');

  constructor(
    private readonly cls: ClsService,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const allowed = await super.canActivate(context);
    if (!allowed) return false;

    const req = context.switchToHttp().getRequest();
    const user = req.user;

    if (!user) return true;

    // Load user's site assignments to enrich the user object
    // This is needed for PrismaService.buildSiteFilter()
    if (user.role !== 'API_KEY' && user.sub) {
      const siteAssignments =
        await this.prisma.client.userSiteAssignment.findMany({
          where: { userId: user.sub },
          select: { siteId: true, isDefault: true },
        });
      user.sites = siteAssignments;
    }

    // Set user in CLS context
    this.cls.set('user', user);

    // Parse and validate X-Site-Id header
    const siteHeader = req.headers['x-site-id'];
    if (siteHeader) {
      const parsed = parseInt(String(siteHeader), 10);

      if (isNaN(parsed) || parsed <= 0) {
        throw new ForbiddenException(
          'Invalid X-Site-Id header: must be a positive integer.',
        );
      }

      // SUPER_ADMIN and API_KEY bypass site validation (global access)
      if (user.role !== 'SUPER_ADMIN' && user.role !== 'API_KEY') {
        const userSiteIds: number[] =
          user.sites?.map((s: any) => s.siteId) || [];

        if (!userSiteIds.includes(parsed)) {
          this.logger.warn(
            `[SECURITY] X-Site-Id access denied — userId: ${user.sub}, ` +
            `requestedSite: ${parsed}, allowedSites: [${userSiteIds.join(', ')}]`,
          );
          throw new ForbiddenException(
            `Access denied: you are not assigned to site ${parsed}.`,
          );
        }
      }

      this.cls.set('selectedSiteId', parsed);
    }

    return true;
  }
}

