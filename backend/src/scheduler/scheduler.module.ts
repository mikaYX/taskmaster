import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { SchedulerService } from './scheduler.service';
import { JobsController } from './scheduler.controller';
import {
  CleanupExportsJob,
  CleanupBackupsJob,
  HealthCheckJob,
  AutoBackupJob,
  AutoExportJob,
  MissingTasksNotificationJob,
  ReminderNotificationJob,
} from './jobs';
import { JobLockService } from './job-lock.service';
import { SettingsModule } from '../settings';
import { BackupModule } from '../backup';
import { AuditScheduler } from './audit.scheduler';
import { TasksModule } from '../tasks/tasks.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { EmailModule } from '../email/email.module';
import { DelegationsModule } from '../modules/delegations/delegations.module';

/**
 * Scheduler Module.
 *
 * Provides scheduled job execution.
 * Jobs: cleanup-exports, cleanup-backups, health-check.
 */
@Module({
  imports: [
    ScheduleModule.forRoot(),
    SettingsModule,
    BackupModule,
    TasksModule,
    NotificationsModule,
    EmailModule,
    DelegationsModule,
  ],
  controllers: [JobsController],
  providers: [
    SchedulerService,
    JobLockService,
    CleanupExportsJob,
    CleanupBackupsJob,
    HealthCheckJob,
    AuditScheduler,
    AutoBackupJob,
    AutoExportJob,
    MissingTasksNotificationJob,
    ReminderNotificationJob,
  ],
  exports: [SchedulerService],
})
export class SchedulerModule {}
