import { Module } from '@nestjs/common';
import { StatusService } from './status.service';
import { StatusController } from './status.controller';
import { NotificationsModule } from '../notifications/notifications.module';

/**
 * Status Module.
 *
 * Provides:
 * - Task status management per date
 * - Audit trail (who updated, when)
 * - Idempotent upsert
 *
 * No instance calculation, no scheduler.
 */
@Module({
  imports: [NotificationsModule],
  controllers: [StatusController],
  providers: [StatusService],
  exports: [StatusService],
})
export class StatusModule {}
