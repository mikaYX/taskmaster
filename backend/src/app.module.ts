import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ClsModule } from 'nestjs-cls';
import { LoggerModule } from 'nestjs-pino';
import { PrismaModule } from './prisma';
import { AuthModule } from './auth';
import { UsersModule } from './users';
import { GroupsModule } from './groups';
import { TasksModule } from './tasks';
import { ScheduleModule } from './schedules/schedule.module';
import { StatusModule } from './status';
import { SettingsModule } from './settings';
import { GuestsModule } from './guests/guests.module';

import { EmailModule } from './email';
import { BackupModule } from './backup';
import { SchedulerModule } from './scheduler';
import { DashboardModule } from './dashboard';
import { SetupModule } from './setup';
import { HolidaysModule } from './holidays';
import { validate } from './config';
import { join } from 'path';
import { AuditModule } from './audit/audit.module';

import { RedisModule } from './common/redis/redis.module';
import { QueueModule } from './queues/queue.module';
import { MetricsModule } from './metrics/metrics.module';
import { CorrelationIdMiddleware } from './common/middleware/correlation-id.middleware';
import { AsyncContextMiddleware } from './common/middleware/async-context.middleware';
import { HealthModule } from './health/health.module';
import { DelegationsModule } from './modules/delegations/delegations.module';
import { SitesModule } from './sites/sites.module';
import { NotificationsModule } from './notifications/notifications.module';
import { TodosModule } from './todos/todos.module';
import { AnalyticsModule } from './analytics';

import { IntegrationsModule } from './integrations/integrations.module';
import { SystemModule } from './system';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate,
      cache: true,
      envFilePath: [join(__dirname, '..', '..', '..', '.env'), '.env'],
    }),
    LoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const isProd = config.get<string>('NODE_ENV') === 'production';
        return {
          pinoHttp: {
            level: isProd ? 'info' : 'debug',
            // En production : JSON brut parseable par Datadog/Loki/ELK
            // En dev : format lisible avec pino-pretty
            transport: isProd
              ? undefined
              : {
                  target: 'pino-pretty',
                  options: { singleLine: true, colorize: true },
                },
            // Ne jamais logger les tokens d'auth — étendu au body sensible
            // (AUDIT.md Finding #18). Les valeurs ciblées sont remplacées par
            // `[Redacted]` dans tous les logs, y compris les niveaux debug.
            redact: [
              'req.headers.authorization',
              'req.headers.cookie',
              'req.headers["x-api-key"]',
              'req.body.password',
              'req.body.currentPassword',
              'req.body.newPassword',
              'req.body.confirmPassword',
              'req.body.token',
              'req.body.refreshToken',
              'req.body.ssoTicket',
              'req.body.sso_ticket',
              'req.body.apiKey',
              'req.body.mfaToken',
              'req.body.totpToken',
              'req.body.recoveryCode',
              'res.headers["set-cookie"]',
            ],
            customProps: () => ({
              service: 'taskmaster-backend',
            }),
          },
        };
      },
    }),
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), 'public'),
      serveRoot: '/public',
    }),
    ClsModule.forRoot({
      global: true,
      middleware: { mount: true }, // Automatically mounts ClsMiddleware
    }),
    // Rate limiting: 60 requests per minute per IP
    ThrottlerModule.forRoot([
      {
        ttl: 60000, // 1 minute in milliseconds
        limit: 60,
      },
    ]),
    RedisModule,
    QueueModule,
    PrismaModule,
    SetupModule, // Setup must be before Auth for first-time setup
    AuthModule,
    UsersModule,
    GroupsModule,
    TasksModule,
    ScheduleModule,
    StatusModule,
    SettingsModule,

    EmailModule,
    BackupModule,
    SchedulerModule,
    DashboardModule,
    HolidaysModule,
    AuditModule,
    MetricsModule,
    HealthModule,
    DelegationsModule,
    SitesModule,
    NotificationsModule,
    TodosModule,
    AnalyticsModule,
    IntegrationsModule,
    GuestsModule,
    SystemModule,
  ],
  controllers: [],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(CorrelationIdMiddleware, AsyncContextMiddleware)
      .forRoutes('{*splat}');
  }
}
