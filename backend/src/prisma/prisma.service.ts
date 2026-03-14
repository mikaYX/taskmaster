import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { ClsService } from 'nestjs-cls';

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private readonly pool: Pool;
  private _client: PrismaClient;

  constructor(
    private readonly configService: ConfigService,
    private readonly cls: ClsService,
  ) {
    const connectionString = configService.get<string>('DATABASE_URL');
    const safeUrl = connectionString?.replace(/:([^:@]+)@/, ':****@');
    this.logger.log(`Initializing Prisma with PG Adapter URL: ${safeUrl}`);

    const pool = new Pool({ connectionString });
    const adapter = new PrismaPg(pool);

    this._client = new PrismaClient({ adapter });
    this.pool = pool;
  }

  get client(): PrismaClient {
    return this._client;
  }

  getCurrentUser():
    | {
        id: number;
        role: string;
        sites: Array<{ siteId: number; isDefault: boolean }>;
      }
    | undefined {
    try {
      return this.cls.get('user');
    } catch {
      return undefined;
    }
  }

  getUserSiteIds(): number[] {
    const user = this.getCurrentUser();
    if (!user) return [];
    return user.sites?.map((s) => s.siteId) || [];
  }

  getDefaultSiteId(): number | undefined {
    const user = this.getCurrentUser();
    if (!user) return undefined;
    const defaultSite = user.sites?.find((s) => s.isDefault);
    return defaultSite?.siteId || user.sites?.[0]?.siteId;
  }

  buildSiteFilter(): { siteId?: number | { in: number[] } } {
    const user = this.getCurrentUser();

    const selectedSiteId: number | undefined = (() => {
      try {
        return this.cls.get<number>('selectedSiteId');
      } catch {
        return undefined;
      }
    })();

    if (!user) return {};

    if (user.role === 'SUPER_ADMIN') {
      // SUPER_ADMIN: si un site est sélectionné, filtre sur ce site ; sinon pas de filtre
      return selectedSiteId != null ? { siteId: selectedSiteId } : {};
    }

    const siteIds = this.getUserSiteIds();
    if (siteIds.length === 0) return {};

    // Si l'utilisateur a sélectionné un site qui lui est autorisé, restreindre à ce site
    if (selectedSiteId != null && siteIds.includes(selectedSiteId)) {
      return { siteId: selectedSiteId };
    }

    if (siteIds.length === 1) return { siteId: siteIds[0] };
    return { siteId: { in: siteIds } };
  }

  isSuperAdmin(): boolean {
    const user = this.getCurrentUser();
    return user?.role === 'SUPER_ADMIN';
  }

  async onModuleInit(): Promise<void> {
    this.logger.log('Connecting to database...');
    await this._client.$connect();
    this.logger.log('Database connection established');
  }

  async onModuleDestroy(): Promise<void> {
    this.logger.log('Disconnecting from database...');
    await this._client.$disconnect();
    await this.pool.end();
    this.logger.log('Database connection closed');
  }
}
