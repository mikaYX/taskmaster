import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import type { SchedulerJob } from '../scheduler.interface';
import { TodosService } from '../../todos/todos.service';
import { UserNotificationsService } from '../../notifications/user-notifications.service';

/**
 * Daily upkeep of the todolist: recurring todos that nobody ticked come back at
 * their next date, and old notifications of the bell are cleared.
 */
@Injectable()
export class TodoMaintenanceJob implements SchedulerJob {
  readonly name = 'todo-maintenance';
  readonly cron = '10 0 * * *';

  private readonly logger = new Logger(TodoMaintenanceJob.name);

  constructor(
    private readonly todos: TodosService,
    private readonly inbox: UserNotificationsService,
  ) {}

  @Cron('10 0 * * *', { name: 'todo-maintenance' })
  async execute(now: Date = new Date()): Promise<void> {
    const [rolled, purged] = await Promise.all([
      this.todos.rollOverdueRecurring(now),
      this.inbox.purgeOld(now),
    ]);
    if (rolled > 0 || purged > 0) {
      this.logger.log(
        `Todo maintenance: ${rolled} recurring todos rolled over, ${purged} old notifications removed`,
      );
    }
  }
}
