import { JobRunner } from '../job-runner.service';
import { JOB_DEFINITIONS } from '../job-definitions';
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import type { SchedulerJob } from '../scheduler.interface';
import { UserNotificationsService } from '../../notifications/user-notifications.service';

/** Daily upkeep of the todolist: old notifications of the bell are cleared. */
const DEF = JOB_DEFINITIONS['todo-maintenance'];

@Injectable()
export class TodoMaintenanceJob implements SchedulerJob {
  readonly name = DEF.name;
  readonly cron = DEF.cron;

  private readonly logger = new Logger(TodoMaintenanceJob.name);

  constructor(
    private readonly inbox: UserNotificationsService,
    private readonly runner: JobRunner,
  ) {
    this.runner.register(DEF, () => this.execute());
  }

  @Cron(DEF.cron, { name: DEF.name })
  handleCron() {
    return this.runner.run(DEF.name, 'cron');
  }

  async execute(now: Date = new Date()): Promise<void> {
    const purged = await this.inbox.purgeOld(now);
    if (purged > 0) {
      this.logger.log(`Todo maintenance: ${purged} old notifications removed`);
    }
  }
}
