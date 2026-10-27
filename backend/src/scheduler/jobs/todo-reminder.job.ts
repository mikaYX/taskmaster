import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { formatInTimeZone } from 'date-fns-tz';
import type { SchedulerJob } from '../scheduler.interface';
import { PrismaService } from '../../prisma';
import { SettingsService } from '../../settings/settings.service';
import { EmailService } from '../../email/email.service';
import { UserNotificationsService } from '../../notifications/user-notifications.service';
import { dueMoment, isReminderDue } from '../../todos/todo-reminder-time';

const DAY_MS = 24 * 60 * 60 * 1000;
/** A reminder never leads by more than a week; look a little further to be safe. */
const LOOK_AHEAD_DAYS = 9;
const LOOK_BACK_DAYS = 3;
const TITLES_IN_BODY = 5;

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

interface Recipient {
  id: number;
  email: string | null;
  deletedAt: Date | null;
  todoReminderEmail: boolean;
  todoReminderPush: boolean;
  todoReminderCollective: boolean;
}

interface DueTodo {
  id: number;
  title: string;
  due: Date;
}

const RECIPIENT_SELECT = {
  id: true,
  email: true,
  deletedAt: true,
  todoReminderEmail: true,
  todoReminderPush: true,
  todoReminderCollective: true,
} as const;

/**
 * Todolist reminders, hourly. A todo is due from the lead time it asked for (a day by
 * default) before its due moment; each person gets one digest on the channels they
 * chose: the bell (always), a browser pop-up and an email.
 *
 * - private todo: its owner;
 * - collective todo with someone in charge: that person only;
 * - other collective todos: the members of their group who did not opt out
 *   (their creator when they are for the whole site).
 */
@Injectable()
export class TodoReminderJob implements SchedulerJob {
  readonly name = 'todo-reminders';
  readonly cron = '0 * * * *';

  private readonly logger = new Logger(TodoReminderJob.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly email: EmailService,
    private readonly inbox: UserNotificationsService,
  ) {}

  @Cron('0 * * * *', { name: 'todo-reminders' })
  async execute(now: Date = new Date()): Promise<void> {
    const [todolist, emailEnabled, timeZone] = await Promise.all([
      this.settings.getRawValue<boolean>('addons.todolist.enabled'),
      this.settings.getRawValue<boolean>('email.enabled'),
      this.settings.getRawValue<string>('scheduler.timezone'),
    ]);
    const on = (v: unknown) => v === true || v === 'true';
    if (!on(todolist)) return;
    const zone = timeZone || 'Europe/Paris';

    const todos = await this.prisma.client.todo.findMany({
      where: {
        isCompleted: false,
        reminderSentAt: null,
        dueDate: {
          gte: new Date(now.getTime() - LOOK_BACK_DAYS * DAY_MS),
          lte: new Date(now.getTime() + LOOK_AHEAD_DAYS * DAY_MS),
        },
      },
      select: {
        id: true,
        title: true,
        dueDate: true,
        dueTime: true,
        remindBeforeMinutes: true,
        scope: true,
        groupId: true,
        user: { select: RECIPIENT_SELECT },
        assignee: { select: RECIPIENT_SELECT },
        group: {
          select: {
            members: { select: { user: { select: RECIPIENT_SELECT } } },
          },
        },
      },
    });

    const byRecipient = new Map<
      number,
      { person: Recipient; items: DueTodo[] }
    >();
    const handled: number[] = [];
    for (const todo of todos) {
      if (!todo.dueDate) continue;
      const due = dueMoment(todo.dueDate, todo.dueTime, zone);
      if (!isReminderDue(now, due, todo.remindBeforeMinutes)) continue;
      handled.push(todo.id);

      let people: Recipient[];
      if (todo.scope === 'PRIVATE') {
        people = [todo.user];
      } else if (todo.assignee) {
        people = [todo.assignee];
      } else if (todo.group) {
        people = todo.group.members
          .map((m) => m.user)
          .filter((u) => u.todoReminderCollective);
      } else {
        people = todo.user.todoReminderCollective ? [todo.user] : [];
      }
      for (const person of people) {
        if (person.deletedAt) continue;
        const entry = byRecipient.get(person.id) ?? { person, items: [] };
        entry.items.push({ id: todo.id, title: todo.title, due });
        byRecipient.set(person.id, entry);
      }
    }
    if (handled.length === 0) return;

    let emails = 0;
    for (const { person, items } of byRecipient.values()) {
      await this.inbox.notify(
        person.id,
        {
          type: 'todo.reminder',
          title:
            items.length === 1
              ? 'Une tâche arrive à échéance'
              : `${items.length} tâches arrivent à échéance`,
          body: items
            .slice(0, TITLES_IN_BODY)
            .map((i) => i.title)
            .join(' • '),
          url: '/todos',
        },
        { push: person.todoReminderPush },
      );
      if (on(emailEnabled) && person.todoReminderEmail && person.email) {
        const sent = await this.email.send({
          to: person.email,
          subject:
            items.length === 1
              ? 'Rappel : une tâche arrive à échéance'
              : `Rappel : ${items.length} tâches arrivent à échéance`,
          html: this.renderHtml(items, zone),
          text: this.renderText(items, zone),
        });
        if (sent) emails++;
        else this.logger.warn(`Reminder email to user ${person.id} not sent`);
      }
    }

    // Everyone concerned found it in the bell: a failed email is not worth reminding twice.
    await this.prisma.client.todo.updateMany({
      where: { id: { in: handled } },
      data: { reminderSentAt: now },
    });
    this.logger.log(
      `Todo reminders: ${handled.length} todos, ${byRecipient.size} people, ${emails} emails`,
    );
  }

  private link(): string {
    const base = (process.env.FRONTEND_URL || process.env.BACKEND_URL || '')
      .trim()
      .replace(/\/+$/, '');
    return base ? `${base}/todos` : '';
  }

  private when(item: DueTodo, zone: string) {
    return formatInTimeZone(item.due, zone, 'dd/MM/yyyy HH:mm');
  }

  private renderText(items: DueTodo[], zone: string) {
    const lines = items.map((i) => `- ${i.title} (${this.when(i, zone)})`);
    const link = this.link();
    return [...lines, ...(link ? ['', link] : [])].join('\n');
  }

  private renderHtml(items: DueTodo[], zone: string) {
    const list = items
      .map(
        (i) =>
          `<li><strong>${escapeHtml(i.title)}</strong> — ${this.when(i, zone)}</li>`,
      )
      .join('');
    const link = this.link();
    return (
      `<p>Ces tâches de votre liste arrivent à échéance :</p><ul>${list}</ul>` +
      (link
        ? `<p><a href="${escapeHtml(link)}">Ouvrir la liste de tâches</a></p>`
        : '')
    );
  }
}
