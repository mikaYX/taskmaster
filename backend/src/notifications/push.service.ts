import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as webpush from 'web-push';

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
 * Gère :
 * - L'initialisation des clés VAPID depuis les variables d'environnement
 * - Le stockage en mémoire des abonnements (à migrer en DB pour la production)
 * - L'envoi de notifications push aux abonnés
 *
 * Pré-requis .env :
 *   VAPID_PUBLIC_KEY=<base64url>
 *   VAPID_PRIVATE_KEY=<base64url>
 *   VAPID_CONTACT=mailto:admin@example.com
 *
 * Générer les clés : npx web-push generate-vapid-keys
 */
@Injectable()
export class PushService implements OnModuleInit {
  private readonly logger = new Logger(PushService.name);

  /** Abonnements en mémoire — clé = endpoint URL */
  private readonly subscriptions = new Map<string, PushSubscriptionPayload>();

  private isConfigured = false;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const publicKey = this.config.get<string>('VAPID_PUBLIC_KEY');
    const privateKey = this.config.get<string>('VAPID_PRIVATE_KEY');
    const contact = this.config.get<string>('VAPID_CONTACT', 'mailto:admin@taskmaster.local');

    if (!publicKey || !privateKey) {
      this.logger.warn(
        'VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY non configurées — Push désactivé. ' +
        'Générer avec : npx web-push generate-vapid-keys',
      );
      return;
    }

    webpush.setVapidDetails(contact, publicKey, privateKey);
    this.isConfigured = true;
    this.logger.log('Web Push (VAPID) initialisé');
  }

  /** Retourne la clé publique VAPID pour le frontend. */
  getPublicKey(): string | null {
    return this.config.get<string>('VAPID_PUBLIC_KEY') ?? null;
  }

  /** Enregistre un abonnement push pour un utilisateur. */
  subscribe(payload: PushSubscriptionPayload): void {
    this.subscriptions.set(payload.endpoint, payload);
    this.logger.log(
      `Push subscription enregistrée pour userId=${payload.userId} (${this.subscriptions.size} total)`,
    );
  }

  /** Supprime l'abonnement correspondant à cet endpoint. */
  unsubscribe(endpoint: string): void {
    this.subscriptions.delete(endpoint);
    this.logger.log(`Push subscription supprimée (endpoint: ${endpoint.slice(0, 40)}...)`);
  }

  /** Envoie un message push à tous les abonnés d'un utilisateur. */
  async sendToUser(userId: number, message: PushMessage): Promise<void> {
    if (!this.isConfigured) return;

    const userSubs = [...this.subscriptions.values()].filter(
      (s) => s.userId === userId,
    );

    if (userSubs.length === 0) return;

    const payload = JSON.stringify(message);

    await Promise.allSettled(
      userSubs.map((sub) =>
        webpush
          .sendNotification(
            { endpoint: sub.endpoint, keys: sub.keys },
            payload,
          )
          .catch((err: Error & { statusCode?: number }) => {
            if (err.statusCode === 410) {
              // Abonnement expiré — on le supprime
              this.subscriptions.delete(sub.endpoint);
              this.logger.debug(`Abonnement expiré supprimé pour userId=${userId}`);
            } else {
              this.logger.error(`Erreur push userId=${userId}: ${err.message}`);
            }
          }),
      ),
    );
  }

  /** Envoie un message push via la config d'un canal (utilisé par NotificationsService). */
  async sendViaChannelConfig(config: Record<string, unknown>, text: string): Promise<void> {
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
