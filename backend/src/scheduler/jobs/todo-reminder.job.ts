import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import type { SchedulerJob } from '../scheduler.interface';
import { PrismaService } from '../../prisma';
import { SettingsService } from '../../settings/settings.service';
import { EmailService } from '../../email/email.service';

const DAY_MS = 24 * 60 * 60 * 1000;

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

interface ReminderTodo {
  id: number;
  title: string;
  dueDate: Date | null;
}

/**
 * Todolist reminders: one digest email per person, hourly, for the todos
 * that are due within the next 24 hours (or were due in the last 24 hours)
 * and have not been reminded yet. Private todos go to their owner, collective
 * ones to the members of their group (or to their creator for the whole site).
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
  ) {}

  @Cron('0 * * * *', { name: 'todo-reminders' })
  async execute(): Promise<void> {
    const [todolist, reminders, emailEnabled] = await Promise.all([
      this.settings.getRawValue<boolean>('addons.todolist.enabled'),
      this.settings.getRawValue<boolean>('addons.todolist.reminders.enabled'),
      this.settings.getRawValue<boolean>('email.enabled'),
    ]);
    const on = (v: unknown) => v === true || v === 'true';
    if (!on(todolist) || !on(reminders) || !on(emailEnabled)) return;

    const now = Date.now();
    const todos = await this.prisma.client.todo.findMany({
      where: {
        isCompleted: false,
        reminderSentAt: null,
        dueDate: { gte: new Date(now - DAY_MS), lte: new Date(now + DAY_MS) },
      },
      select: {
        id: true,
        title: true,
        dueDate: true,
        scope: true,
        groupId: true,
        user: { select: { email: true, deletedAt: true } },
        group: {
          select: {
            members: {
              select: { user: { select: { email: true, deletedAt: true } } },
            },
          },
        },
      },
    });
    if (todos.length === 0) return;

    const byRecipient = new Map<string, ReminderTodo[]>();
    for (const todo of todos) {
      const people =
        todo.scope === 'COLLECTIVE' && todo.group
          ? todo.group.members.map((m) => m.user)
          : [todo.user];
      for (const person of people) {
        if (!person.email || person.deletedAt) continue;
        const list = byRecipient.get(person.email) ?? [];
        list.push(todo);
        byRecipient.set(person.email, list);
      }
    }

    const reminded = new Set<number>();
    for (const [to, list] of byRecipient) {
      const sent = await this.email.send({
        to,
        subject:
          list.length === 1
            ? 'Rappel : une tâche arrive à échéance'
            : `Rappel : ${list.length} tâches arrivent à échéance`,
        html: this.render(list),
        text: list
          .map((t) => `- ${t.title} (${this.formatDate(t.dueDate)})`)
          .join('\n'),
      });
      if (sent) list.forEach((t) => reminded.add(t.id));
    }

    if (reminded.size > 0) {
      await this.prisma.client.todo.updateMany({
        where: { id: { in: [...reminded] } },
        data: { reminderSentAt: new Date() },
      });
    }
    this.logger.log(
      `Todo reminders: ${reminded.size}/${todos.length} todos reminded, ${byRecipient.size} recipients`,
    );
  }

  private formatDate(date: Date | null) {
    return date ? date.toISOString().slice(0, 10) : '';
  }

  private render(list: ReminderTodo[]) {
    const items = list
      .map(
        (t) =>
          `<li><strong>${escapeHtml(t.title)}</strong> — ${this.formatDate(t.dueDate)}</li>`,
      )
      .join('');
    return `<p>Ces tâches de votre todo list arrivent à échéance :</p><ul>${items}</ul>`;
  }
}
