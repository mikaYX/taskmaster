import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { SettingsModule } from '../settings/settings.module';
import { DelegationsModule } from '../modules/delegations/delegations.module';
import { TasksService } from './tasks.service';

import { TasksController } from './tasks.controller';
import { InstanceService } from './instance.service';
import { RecurrenceService } from './recurrence.service';
import { ProcedureStorageService } from './procedure-storage.service';

/**
 * Tasks Module.
 *
 * Provides:
 * - Task definition CRUD
 * - User/Group assignment management
 * - Delegation structure
 *
 * No status/instances/scheduler logic.
 */
@Module({
  imports: [ScheduleModule, SettingsModule, DelegationsModule],
  controllers: [TasksController],
  providers: [
    TasksService,

    InstanceService,
    RecurrenceService,
    ProcedureStorageService,
  ],
  exports: [
    TasksService,

    InstanceService,
    RecurrenceService,
    ProcedureStorageService,
  ],
})
export class TasksModule {}
