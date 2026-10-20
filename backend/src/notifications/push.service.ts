import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as webpush from 'web-push';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';

export interface PushSubscriptionPayload {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  userId: number;
  userAgent?: string;
}

export interface PushMessage {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  url?: string;
  tag?: string;
}

/**
 * Service Web Push (VAPID).
 *
 * - Clés VAPID : variables d'environnement `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`
 *   (prioritaires), sinon les réglages `push.vapid.*`; si rien n'existe, une paire est
 *   générée au premier démarrage et conservée dans les réglages (la clé privée chiffrée),
 *   ce qui évite toute étape manuelle sur une installation Windows.
 * - Les abonnements sont conservés en base : un redémarrage du serveur ne les perd plus.
 *
 * Le navigateur n'accepte les notifications push que sur HTTPS (ou localhost).
 */
@Injectable()
export class PushService implements OnModuleInit {
  private readonly logger = new Logger(PushService.name);

  private publicKey: string | null = null;
  private isConfigured = false;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      const keys = await this.resolveKeys();
      if (!keys) return;
      const contact = this.config.get<string>(
        'VAPID_CONTACT',
        'mailto:admin@taskmaster.local',
      );
      webpush.setVapidDetails(contact, keys.publicKey, keys.privateKey);
      this.publicKey = keys.publicKey;
      this.isConfigured = true;
      this.logger.log('Web Push (VAPID) initialisé');
    } catch (error) {
      this.logger.error(
        `Web Push désactivé : ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async resolveKeys(): Promise<{
    publicKey: string;
    privateKey: string;
  } | null> {
    const envPublic = this.config.get<string>('VAPID_PUBLIC_KEY');
    const envPrivate = this.config.get<string>('VAPID_PRIVATE_KEY');
    if (envPublic && envPrivate) {
      return { publicKey: envPublic, privateKey: envPrivate };
    }

    const storedPublic = await this.settings.getRawValue<string>(
      'push.vapid.publicKey',
    );
    const storedPrivate = await this.settings.getRawValue<string>(
      'push.vapid.privateKey',
    );
    if (storedPublic && storedPrivate) {
      return { publicKey: storedPublic, privateKey: storedPrivate };
    }

    const generated = webpush.generateVAPIDKeys();
    await this.settings.set('push.vapid.publicKey', generated.publicKey);
    await this.settings.set('push.vapid.privateKey', generated.privateKey);
    this.logger.log('Paire de clés VAPID générée et enregistrée');
    return generated;
  }

  /** Whether the server can send pushes at all. */
  isEnabled(): boolean {
    return this.isConfigured;
  }

  /** Retourne la clé publique VAPID pour le frontend. */
  getPublicKey(): string | null {
    return this.publicKey;
  }

  /** Enregistre (ou rattache à l'utilisateur courant) l'abonnement d'un navigateur. */
  async subscribe(payload: PushSubscriptionPayload): Promise<void> {
    await this.prisma.client.pushSubscription.upsert({
      where: { endpoint: payload.endpoint },
      create: {
        endpoint: payload.endpoint,
        p256dh: payload.keys.p256dh,
        auth: payload.keys.auth,
        userId: payload.userId,
        userAgent: payload.userAgent?.slice(0, 255),
      },
      // The same browser can be used by someone else after a sign-out.
      update: {
        p256dh: payload.keys.p256dh,
        auth: payload.keys.auth,
        userId: payload.userId,
        userAgent: payload.userAgent?.slice(0, 255),
      },
    });
    this.logger.log(
      `Push subscription enregistrée pour userId=${payload.userId}`,
    );
  }

  /** Supprime l'abonnement correspondant à cet endpoint, s'il appartient à l'utilisateur. */
  async unsubscribe(endpoint: string, userId?: number): Promise<void> {
    await this.prisma.client.pushSubscription.deleteMany({
      where: { endpoint, ...(userId !== undefined ? { userId } : {}) },
    });
  }

  /** Nombre d'appareils abonnés pour un utilisateur. */
  async countForUser(userId: number): Promise<number> {
    return this.prisma.client.pushSubscription.count({ where: { userId } });
  }

  /** Envoie un message push à tous les appareils d'un utilisateur. */
  async sendToUser(userId: number, message: PushMessage): Promise<void> {
    if (!this.isConfigured) return;

    const userSubs = await this.prisma.client.pushSubscription.findMany({
      where: { userId },
    });
    if (userSubs.length === 0) return;

    const payload = JSON.stringify(message);

    await Promise.allSettled(
      userSubs.map((sub) =>
        webpush
          .sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            payload,
          )
          .catch(async (err: Error & { statusCode?: number }) => {
            if (err.statusCode === 404 || err.statusCode === 410) {
              // Abonnement expiré — on le supprime
              await this.prisma.client.pushSubscription.deleteMany({
                where: { endpoint: sub.endpoint },
              });
              this.logger.debug(
                `Abonnement expiré supprimé pour userId=${userId}`,
              );
            } else {
              this.logger.error(`Erreur push userId=${userId}: ${err.message}`);
            }
          }),
      ),
    );
  }

  /** Envoie un message push via la config d'un canal (utilisé par NotificationsService). */
  async sendViaChannelConfig(
    config: Record<string, unknown>,
    text: string,
  ): Promise<void> {
    if (!this.isConfigured) {
      this.logger.debug('Push désactivé (VAPID non configuré)');
      return;
    }

    // Si le canal a un userId cible dans sa config
    const targetUserId = config['userId'] as number | undefined;
    if (!targetUserId) {
      this.logger.warn('Canal PUSH sans userId cible — message ignoré');
      return;
    }

    await this.sendToUser(targetUserId, { title: 'Taskmaster', body: text });
  }
}
