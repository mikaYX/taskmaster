import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { NotificationChannelType, Prisma } from '@prisma/client';
import { formatInTimeZone } from 'date-fns-tz';
import { safeFetch } from '../common/utils/url-validator.util';
import { EmailService } from '../email/email.service';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from '../settings/encryption.service';
import { SettingsService } from '../settings/settings.service';
import {
  CreateNotificationChannelDto,
  UpdateNotificationChannelDto,
} from './dto/channel.dto';
import { SaveTaskNotificationsDto } from './dto/task-notification.dto';
import { PushService } from './push.service';
import { resolveEmailLogoUrl } from '../users/credentials-email.template';
import {
  TaskNotificationEvent,
  renderTaskNotificationEmail,
} from './task-notification-email.template';

/** What the caller knows about the occurrence that triggered the notification. */
export interface TaskNotificationContext {
  /** Occurrence date, YYYY-MM-DD. */
  instanceDate?: string;
  /** Free-text reason given when the task was marked as failed. */
  comment?: string | null;
  /** Who marked the occurrence. */
  actor?: string | null;
  /** Title of the corrective action created together with the failure. */
  correctiveAction?: string | null;
  /** Only send through this notification row (each channel has its own reminder delay). */
  notificationId?: number;
  /** When the occurrence has to be finished. */
  deadline?: Date;
}

export interface DetailLine {
  label: string;
  value: string;
}

const PRIORITY_LABELS: Record<string, string> = {
  LOW: 'Basse',
  MEDIUM: 'Moyenne',
  HIGH: 'Haute',
  CRITICAL: 'Critique',
};

/** Setting that lists the channels the todolist uses; kept clean when a channel goes away. */
export const TODO_CHANNELS_SETTING = 'addons.todolist.notify.channelIds';

/** Email and push reach a person; every other channel posts one message for the whole team. */
const PERSONAL_CHANNEL_TYPES: NotificationChannelType[] = ['EMAIL', 'PUSH'];

const DEFAULT_REMINDER_OFFSET_MINUTES = 60;
const REMINDER_OFFSET_STEP_MINUTES = 15;
const MAX_REMINDER_OFFSET_MINUTES = 24 * 60;

const appBaseUrl = () =>
  (process.env.FRONTEND_URL || process.env.BACKEND_URL || '')
    .trim()
    .replace(/\/+$/, '');

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly emailService: EmailService,
    private readonly settingsService: SettingsService,
    private readonly pushService: PushService,
  ) {}

  async getChannels(enabled?: boolean) {
    const whereClause = enabled !== undefined ? { enabled } : {};
    const channels = await this.prisma.client.notificationChannel.findMany({
      where: whereClause,
      include: { _count: { select: { taskNotifications: true } } },
    });
    return channels.map((c: any) => this.mapChannelToDto(c));
  }

  async getChannelById(id: number) {
    const channel = await this.prisma.client.notificationChannel.findUnique({
      where: { id },
    });

    if (!channel) {
      throw new NotFoundException('Notification channel not found');
    }

    return this.mapChannelToDto(channel);
  }

  async createChannel(dto: CreateNotificationChannelDto) {
    const configString = dto.config ? JSON.stringify(dto.config) : '{}';
    const encryptedConfig = this.encryption.encrypt(configString);

    const channel = await this.prisma.client.notificationChannel.create({
      data: {
        type: dto.type,
        name: dto.name,
        config: encryptedConfig,
        enabled: dto.enabled ?? true,
      },
    });

    return this.mapChannelToDto(channel);
  }

  async updateChannel(id: number, dto: UpdateNotificationChannelDto) {
    const existing = await this.prisma.client.notificationChannel.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException('Notification channel not found');
    }

    const updateData: any = {};
    if (dto.type) updateData.type = dto.type;
    if (dto.name) updateData.name = dto.name;
    if (dto.enabled !== undefined) updateData.enabled = dto.enabled;

    if (dto.config) {
      const configString = JSON.stringify(dto.config);
      updateData.config = this.encryption.encrypt(configString);
    }

    const channel = await this.prisma.client.notificationChannel.update({
      where: { id },
      data: updateData,
    });

    return this.mapChannelToDto(channel);
  }

  async deleteChannel(id: number) {
    const existing = await this.prisma.client.notificationChannel.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException('Notification channel not found');
    }

    await this.prisma.client.notificationChannel.delete({
      where: { id },
    });
    await this.forgetTodoChannel(id);

    return { success: true };
  }

  async testChannel(id: number, testEmailAddress?: string) {
    const channel = await this.getChannelById(id);

    if (channel.type === 'EMAIL' || channel.type === 'EMAIL') {
      if (!testEmailAddress) {
        throw new BadRequestException(
          'testEmailAddress is required for EMAIL channel testing',
        );
      }

      // For testing, we pass temporary config to EmailService or rely on a unified send method.
      // Here we assume EmailService can be instructed to send a test email.
      // In a real scenario, EmailService might need tweaking to accept dynamic SMTP configs,
      // but if the system relies on global EMAIL settings, the DB config might just be a template.

      try {
        await this.emailService.sendTest(
          [testEmailAddress],
          'Taskmaster - Notification Test',
          `<p>Ceci est un test pour le canal de notification: <strong>${channel.name}</strong></p>`,
        );
        return { success: true, message: 'Email sent successfully' };
      } catch (error: any) {
        throw new BadRequestException(
          `Failed to send test email: ${error.message}`,
        );
      }
    }

    throw new BadRequestException(
      'Testing is currently only supported for EMAIL channels',
    );
  }

  /** A deleted channel must not stay selected for the todolist. */
  private async forgetTodoChannel(id: number) {
    try {
      const ids = await this.settingsService.getRawValue<number[]>(
        TODO_CHANNELS_SETTING,
      );
      if (Array.isArray(ids) && ids.includes(id)) {
        await this.settingsService.set(
          TODO_CHANNELS_SETTING,
          ids.filter((other) => other !== id),
        );
      }
    } catch (error) {
      this.logger.warn(
        `Could not unlink channel ${id} from the todolist: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Posts one message to the team channels among `channelIds` (Slack, Teams, Discord,
   * Telegram, webhook) that are still enabled. Email and push reach a person: the caller
   * sends those itself. Never throws.
   */
  async broadcast(
    channelIds: number[],
    subject: string,
    details: DetailLine[],
  ) {
    if (channelIds.length === 0) return;
    try {
      const channels = await this.prisma.client.notificationChannel.findMany({
        where: {
          id: { in: channelIds },
          enabled: true,
          type: { notIn: PERSONAL_CHANNEL_TYPES },
        },
      });
      const message = this.buildNotificationMessage(subject, details);
      for (const channel of channels) {
        let config = {};
        try {
          config = JSON.parse(this.encryption.decrypt(channel.config));
        } catch {
          this.logger.error(
            `Failed to decrypt config for channel ${channel.id}`,
          );
          continue;
        }
        await this.sendToChannel(
          channel.type,
          config,
          {},
          message,
          subject,
          subject,
          subject,
          details,
        ).catch((err) => {
          this.logger.error(
            `Error sending ${channel.type} broadcast on channel ${channel.id}:`,
            err,
          );
        });
      }
    } catch (error) {
      this.logger.error('Failed to broadcast notification:', error);
    }
  }

  // ==========================================
  // Task Notifications
  // ==========================================

  async getTaskNotifications(taskId: number) {
    const notifications = await this.prisma.client.taskNotification.findMany({
      where: { taskId },
    });
    return notifications;
  }

  async saveTaskNotifications(taskId: number, dto: SaveTaskNotificationsDto) {
    // Verifier que la tâche existe
    const task = await this.prisma.client.task.findUnique({
      where: { id: taskId },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    for (const n of dto.notifications ?? []) {
      const offset = n.reminderOffsetMinutes;
      if (
        offset !== undefined &&
        (!Number.isInteger(offset) ||
          offset < REMINDER_OFFSET_STEP_MINUTES ||
          offset > MAX_REMINDER_OFFSET_MINUTES ||
          offset % REMINDER_OFFSET_STEP_MINUTES !== 0)
      ) {
        throw new BadRequestException(
          `reminderOffsetMinutes must be a multiple of ${REMINDER_OFFSET_STEP_MINUTES} between ${REMINDER_OFFSET_STEP_MINUTES} and ${MAX_REMINDER_OFFSET_MINUTES}`,
        );
      }
    }

    // Replace all existing notifications for this task in a transaction
    return this.prisma.client.$transaction(async (prisma) => {
      await prisma.taskNotification.deleteMany({
        where: { taskId },
      });

      if (!dto.notifications || dto.notifications.length === 0) {
        return [];
      }

      const toInsert = dto.notifications.map((n) => ({
        taskId,
        channelId: n.channelId,
        notifyOnFailed: n.notifyOnFailed ?? true,
        notifyOnMissing: n.notifyOnMissing ?? true,
        notifyOnReminder: n.notifyOnReminder ?? false,
        reminderOffsetMinutes:
          n.reminderOffsetMinutes ?? DEFAULT_REMINDER_OFFSET_MINUTES,
        emailUserIds: n.emailUserIds ?? Prisma.DbNull,
        emailGroupIds: n.emailGroupIds ?? Prisma.DbNull,
        emailCustom: n.emailCustom ?? Prisma.DbNull,
      }));

      await prisma.taskNotification.createMany({
        data: toInsert,
      });

      return await prisma.taskNotification.findMany({
        where: { taskId },
      });
    });
  }

  // ==========================================
  // Dispatch Notifications
  // ==========================================

  async dispatchTaskNotifications(
    taskId: number,
    event: TaskNotificationEvent,
    context?: TaskNotificationContext,
  ) {
    try {
      const task = await this.prisma.client.task.findUnique({
        where: { id: taskId },
        select: {
          name: true,
          description: true,
          priority: true,
          timezone: true,
        },
      });

      if (!task) return;

      const notifications = await this.prisma.client.taskNotification.findMany({
        where: { taskId },
        include: { channel: true },
      });

      if (!notifications.length) return;

      for (const notif of notifications) {
        if (
          context?.notificationId !== undefined &&
          notif.id !== context.notificationId
        ) {
          continue;
        }

        if (!notif.channel.enabled) {
          this.logger.warn(
            `Channel ${notif.channelId} is disabled, skipping ${event} notification for task ${taskId}`,
          );
          continue;
        }

        let shouldNotify = false;
        let eventLabel = '';

        switch (event) {
          case 'FAILED':
            shouldNotify = notif.notifyOnFailed;
            eventLabel = 'Échec de tâche';
            break;
          case 'OVERDUE':
            shouldNotify = notif.notifyOnMissing;
            eventLabel = 'Tâche en retard (Manquante)';
            break;
          case 'REMINDER':
            shouldNotify = notif.notifyOnReminder;
            eventLabel = 'Rappel de tâche';
            break;
        }

        if (!shouldNotify) continue;

        const details = this.buildDetails(taskId, task, context);
        const message = this.buildNotificationMessage(eventLabel, details);
        // The date makes each occurrence a distinct subject (one ticket per failure in a helpdesk).
        const subject = `${eventLabel}: ${task.name}${
          context?.instanceDate ? ` — ${context.instanceDate}` : ''
        }`;

        // Decode config once per channel
        let config = {};
        if (notif.channel.config) {
          try {
            config = JSON.parse(this.encryption.decrypt(notif.channel.config));
          } catch {
            this.logger.error(
              `Failed to decrypt config for channel ${notif.channelId}`,
            );
            continue;
          }
        }

        // Dispatch to specific provider without blocking
        this.sendToChannel(
          notif.channel.type,
          config,
          notif,
          message,
          task.name,
          eventLabel,
          subject,
          details,
          event,
        ).catch((err) => {
          this.logger.error(
            `Error sending ${notif.channel.type} notification for task ${taskId}:`,
            err,
          );
        });
      }
    } catch (error) {
      this.logger.error(
        `Failed to dispatch notifications for task ${taskId}:`,
        error,
      );
    }
  }

  /** The facts shared by every channel; empty ones are left out. */
  private buildDetails(
    taskId: number,
    task: {
      name: string;
      description: string | null;
      priority: string | null;
      timezone?: string | null;
    },
    context?: TaskNotificationContext,
  ): DetailLine[] {
    const lines: DetailLine[] = [{ label: 'Tâche', value: task.name }];
    if (context?.instanceDate) {
      lines.push({ label: 'Date', value: context.instanceDate });
    }
    if (context?.deadline) {
      lines.push({
        label: 'Échéance',
        value: formatInTimeZone(
          context.deadline,
          task.timezone || 'UTC',
          'dd/MM/yyyy HH:mm',
        ),
      });
    }
    if (task.priority) {
      lines.push({
        label: 'Priorité',
        value: PRIORITY_LABELS[task.priority] ?? task.priority,
      });
    }
    if (context?.actor) {
      lines.push({ label: 'Signalé par', value: context.actor });
    }
    if (context?.comment?.trim()) {
      lines.push({ label: 'Motif', value: context.comment.trim() });
    }
    if (context?.correctiveAction) {
      lines.push({
        label: 'Action corrective',
        value: context.correctiveAction,
      });
    }
    if (task.description) {
      lines.push({ label: 'Description', value: task.description });
    }
    const base = appBaseUrl();
    if (base) {
      lines.push({
        label: 'Lien',
        value: `${base}/task-definitions/${taskId}`,
      });
    }
    return lines;
  }

  private buildNotificationMessage(
    eventLabel: string,
    details: DetailLine[],
  ): string {
    return `🚨 *${eventLabel}*\n\n${details
      .map((line) => `*${line.label}:* ${line.value}`)
      .join('\n')}`;
  }

  private async sendToChannel(
    type: string,
    config: any,
    notif: any,
    message: string,
    taskName: string,
    eventLabel: string,
    subject: string,
    details: DetailLine[],
    event?: TaskNotificationEvent,
  ) {
    switch (type) {
      case 'SLACK':
        return this.sendSlack(config, message);
      case 'TEAMS':
        return this.sendTeams(config, message);
      case 'TELEGRAM':
        return this.sendTelegram(config, message);
      case 'DISCORD':
        return this.sendDiscord(config, message);
      case 'EMAIL':
        // Team broadcasts carry no event and never target an email channel.
        return (
          event && this.sendEmail(notif, subject, details, event, taskName)
        );
      case 'WEBHOOK':
        return this.sendWebhook(config, message, taskName, eventLabel);
      case 'PUSH':
        return this.sendPush(config, message);
      default:
        this.logger.warn(`Unknown channel type: ${type}`);
    }
  }

  private async sendSlack(config: any, text: string) {
    if (!config.webhookUrl) return;
    await safeFetch(
      config.webhookUrl,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      },
      { timeoutMs: 5000, allowHttp: false },
    );
  }

  private async sendTeams(config: any, text: string) {
    if (!config.webhookUrl) return;
    await safeFetch(
      config.webhookUrl,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      },
      { timeoutMs: 5000, allowHttp: false },
    );
  }

  private async sendTelegram(config: any, text: string) {
    if (!config.botToken || !config.chatId) return;
    const url = `https://api.telegram.org/bot${config.botToken}/sendMessage`;
    await safeFetch(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: config.chatId,
          text,
          parse_mode: 'Markdown',
        }),
      },
      { timeoutMs: 5000, allowHttp: false },
    );
  }

  private async sendDiscord(config: any, text: string) {
    if (!config.webhookUrl) return;
    await safeFetch(
      config.webhookUrl,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text }),
      },
      { timeoutMs: 5000, allowHttp: false },
    );
  }

  private async sendWebhook(
    config: any,
    text: string,
    taskName: string,
    eventLabel: string,
  ) {
    if (!config.webhookUrl) return;

    const method = config.method || 'POST';
    const headers = {
      'Content-Type': 'application/json',
      ...(config.headers || {}),
    };

    // Basic templating if payload is defined
    let body;
    if (config.payloadTemplate) {
      try {
        let strPayload = JSON.stringify(config.payloadTemplate);
        strPayload = strPayload
          .replace(/{{message}}/g, text)
          .replace(/{{taskName}}/g, taskName)
          .replace(/{{eventLabel}}/g, eventLabel);
        body = strPayload;
      } catch {
        body = JSON.stringify({ message: text });
      }
    } else {
      body = JSON.stringify({ message: text });
    }

    await safeFetch(
      config.webhookUrl,
      { method, headers, body },
      { timeoutMs: 10000, allowHttp: false },
    );
  }

  private async sendEmail(
    notif: any,
    subject: string,
    details: DetailLine[],
    event: TaskNotificationEvent,
    taskName: string,
  ) {
    const recipients = new Set<string>();

    // 1. Custom emails
    if (Array.isArray(notif.emailCustom)) {
      notif.emailCustom.forEach((e: string) => recipients.add(e));
    }

    // 2. Users emails
    if (Array.isArray(notif.emailUserIds) && notif.emailUserIds.length > 0) {
      const users = await this.prisma.client.user.findMany({
        where: {
          id: { in: notif.emailUserIds },
          deletedAt: null,
          email: { not: null },
        },
        select: { email: true },
      });
      users.forEach((u) => u.email && recipients.add(u.email));
    }

    // 3. Groups emails
    if (Array.isArray(notif.emailGroupIds) && notif.emailGroupIds.length > 0) {
      const groups = await this.prisma.client.group.findMany({
        where: { id: { in: notif.emailGroupIds } },
        include: {
          members: { include: { user: { select: { email: true } } } },
        },
      });
      groups.forEach((g) => {
        g.members.forEach(
          (m: any) => m.user?.email && recipients.add(m.user.email),
        );
      });
    }

    if (recipients.size === 0) {
      this.logger.warn(
        `Email "${subject}" not sent: channel ${notif.channelId} has no recipient`,
      );
      return;
    }

    const [appTitle, logo] = await Promise.all([
      this.settingsService.getRawValue<string>('app.title'),
      this.settingsService.getRawValue<string>('app.logoUrl'),
    ]);

    const sent = await this.emailService.send({
      to: Array.from(recipients),
      subject,
      html: renderTaskNotificationEmail({
        event,
        taskName,
        details,
        appTitle: appTitle || 'Taskmaster',
        logoUrl: resolveEmailLogoUrl(logo, appBaseUrl()),
      }),
      text: details.map((line) => `${line.label} : ${line.value}`).join('\n'),
    });
    if (!sent) {
      this.logger.warn(
        `Email "${subject}" was not sent (email disabled, provider error or circuit open)`,
      );
    }
  }

  private async sendPush(config: any, text: string) {
    await this.pushService.sendViaChannelConfig(config, text);
  }

  private mapChannelToDto(channel: any) {
    let decryptedConfig = {};
    if (channel.config) {
      try {
        const jsonStr = this.encryption.decrypt(channel.config);
        decryptedConfig = JSON.parse(jsonStr);
      } catch {
        // If decryption fails (e.g., secret changed), return an empty object or a marker
        decryptedConfig = { error: 'Failed to decrypt config' };
      }
    }

    return {
      id: channel.id,
      type: channel.type,
      name: channel.name,
      config: decryptedConfig,
      enabled: channel.enabled,
      createdAt: channel.createdAt,
      updatedAt: channel.updatedAt,
      // Only the list loads the count; other callers get 0.
      taskCount: channel._count?.taskNotifications ?? 0,
    };
  }
}
