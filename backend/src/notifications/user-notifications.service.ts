import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PushService } from './push.service';

export interface InAppNotification {
  /** Machine name of the event: `todo.reminder`, `todo.assigned`, ... */
  type: string;
  title: string;
  body?: string;
  /** Where a click goes, relative to the app (`/todos`). */
  url?: string;
}

const LIST_LIMIT = 30;
const READ_RETENTION_DAYS = 30;
const MAX_RETENTION_DAYS = 90;

/**
 * The in-app notification center (the bell). Everything the application wants to
 * tell a person lands here, whether or not an email or a browser push was also sent.
 */
@Injectable()
export class UserNotificationsService {
  private readonly logger = new Logger(UserNotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
  ) {}

  /**
   * Stores the notification and, when asked, also pops it up on the user's devices.
   * Never throws: a notification must not break the action that caused it.
   */
  async notify(
    userId: number,
    notification: InAppNotification,
    options: { push?: boolean } = {},
  ): Promise<void> {
    try {
      await this.prisma.client.userNotification.create({
        data: {
          userId,
          type: notification.type,
          title: notification.title.slice(0, 255),
          body: notification.body ?? null,
          url: notification.url?.slice(0, 255) ?? null,
        },
      });
      if (options.push) {
        await this.push.sendToUser(userId, {
          title: notification.title,
          body: notification.body ?? '',
          url: notification.url,
          tag: notification.type,
        });
      }
    } catch (error) {
      this.logger.error(
        `Could not notify user ${userId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async list(userId: number) {
    const [items, unread] = await Promise.all([
      this.prisma.client.userNotification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: LIST_LIMIT,
      }),
      this.prisma.client.userNotification.count({
        where: { userId, readAt: null },
      }),
    ]);
    return { unread, items };
  }

  async markRead(userId: number, id: number) {
    await this.prisma.client.userNotification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { success: true };
  }

  async markAllRead(userId: number) {
    const result = await this.prisma.client.userNotification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: result.count };
  }

  /** Read ones go after a month, whatever is left after three. */
  async purgeOld(now: Date = new Date()) {
    const day = 24 * 60 * 60 * 1000;
    const result = await this.prisma.client.userNotification.deleteMany({
      where: {
        OR: [
          {
            readAt: { not: null },
            createdAt: {
              lt: new Date(now.getTime() - READ_RETENTION_DAYS * day),
            },
          },
          {
            createdAt: {
              lt: new Date(now.getTime() - MAX_RETENTION_DAYS * day),
            },
          },
        ],
      },
    });
    return result.count;
  }
}
