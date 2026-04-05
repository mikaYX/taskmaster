import {
  Injectable,
  ExecutionContext,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../../prisma';

/**
 * CompositeAuthGuard — Handles JWT + API Key authentication.
 *
 * After authentication, this guard:
 * 1. Loads user's site assignments from database (JWT users)
 * 2. Validates the X-Site-Id header against those assignments
 * 3. Sets CLS context for downstream services (user, selectedSiteId)
 *
 * Security:
 * - SUPER_ADMIN: can access any site (global access), X-Site-Id optional
 * - API_KEY: MUST provide X-Site-Id (tenant-scoped), used as filter
 * - Regular users (MANAGER, USER): can only access assigned sites
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

    // Parse X-Site-Id header
    const siteHeader = req.headers['x-site-id'];
    const parsed = siteHeader ? parseInt(String(siteHeader), 10) : undefined;

    if (
      siteHeader !== undefined &&
      (parsed === undefined || isNaN(parsed) || parsed <= 0)
    ) {
      throw new BadRequestException(
        'Invalid X-Site-Id header: must be a positive integer.',
      );
    }

    // === API_KEY: X-Site-Id is REQUIRED for tenant scoping ===
    if (user.role === 'API_KEY') {
      if (!parsed) {
        throw new ForbiddenException(
          'API keys must provide X-Site-Id header for tenant-scoped access.',
        );
      }
      // Inject the site as the API key's tenant scope
      // This allows buildSiteFilter() to filter correctly
      user.sites = [{ siteId: parsed, isDefault: true }];
    }

    // === Regular users: validate X-Site-Id against assignments ===
    if (parsed && user.role !== 'SUPER_ADMIN' && user.role !== 'API_KEY') {
      const userSiteIds: number[] = user.sites?.map((s: any) => s.siteId) || [];

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

    // Set CLS context
    this.cls.set('user', user);
    if (parsed) {
      this.cls.set('selectedSiteId', parsed);
    }

    return true;
  }
}
