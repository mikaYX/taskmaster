import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import type { SchedulerJob } from '../scheduler.interface';
import { UserNotificationsService } from '../../notifications/user-notifications.service';

/** Daily upkeep of the todolist: old notifications of the bell are cleared. */
@Injectable()
export class TodoMaintenanceJob implements SchedulerJob {
  readonly name = 'todo-maintenance';
  readonly cron = '10 0 * * *';

  private readonly logger = new Logger(TodoMaintenanceJob.name);

  constructor(private readonly inbox: UserNotificationsService) {}

  @Cron('10 0 * * *', { name: 'todo-maintenance' })
  async execute(now: Date = new Date()): Promise<void> {
    const purged = await this.inbox.purgeOld(now);
    if (purged > 0) {
      this.logger.log(`Todo maintenance: ${purged} old notifications removed`);
    }
  }
}
