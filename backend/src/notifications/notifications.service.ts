import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from '../settings/encryption.service';
import { EmailService } from '../email/email.service';
import { SettingsService } from '../settings/settings.service';
import { PushService } from './push.service';
import {
  CreateNotificationChannelDto,
  UpdateNotificationChannelDto,
} from './dto/channel.dto';
import { SaveTaskNotificationsDto } from './dto/task-notification.dto';
import { Prisma } from '@prisma/client';
import { safeFetch } from '../common/utils/url-validator.util';

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

      const config = channel.config as Record<string, any>;
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
    event: 'FAILED' | 'OVERDUE' | 'REMINDER',
    context?: any,
  ) {
    try {
      const task = await this.prisma.client.task.findUnique({
        where: { id: taskId },
        select: { name: true, description: true },
      });

      if (!task) return;

      const notifications = await this.prisma.client.taskNotification.findMany({
        where: { taskId },
        include: { channel: true },
      });

      if (!notifications.length) return;

      for (const notif of notifications) {
        if (!notif.channel.enabled) continue;

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

        const message = this.buildNotificationMessage(
          task,
          eventLabel,
          context,
        );

        // Decode config once per channel
        let config = {};
        if (notif.channel.config) {
          try {
            config = JSON.parse(this.encryption.decrypt(notif.channel.config));
          } catch (e) {
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

  private buildNotificationMessage(
    task: any,
    eventLabel: string,
    context?: any,
  ): string {
    return `🚨 *${eventLabel}*\n\n*Tâche:* ${task.name}\n${task.description ? `*Description:* ${task.description}\n` : ''}${context ? `*Détails:* ${JSON.stringify(context)}` : ''}`;
  }

  private async sendToChannel(
    type: string,
    config: any,
    notif: any,
    message: string,
    taskName: string,
    eventLabel: string,
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
        return this.sendEmail(notif, `${eventLabel}: ${taskName}`, message);
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
      } catch (e) {
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

  private async sendEmail(notif: any, subject: string, message: string) {
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

    if (recipients.size === 0) return;

    const htmlMessage = message.replace(/\n/g, '<br>');

    await this.emailService.send({
      to: Array.from(recipients),
      subject,
      html: `<div style="font-family: sans-serif; padding: 20px;">
                <h2 style="color: #333;">${subject}</h2>
                <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin-top: 15px;">
                    ${htmlMessage}
                </div>
            </div>`,
      text: message,
    });
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
      } catch (e) {
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
    };
  }
}
