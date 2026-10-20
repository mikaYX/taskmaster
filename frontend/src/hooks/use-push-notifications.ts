import { useState, useEffect, useCallback } from 'react';
import { pushApi } from '@/api/notifications';
import i18n from '@/lib/i18n';

export type PushPermission = 'default' | 'granted' | 'denied' | 'unsupported';

export interface UsePushNotificationsReturn {
  /** Permission actuelle du navigateur */
  permission: PushPermission;
  /** true si le navigateur supporte les Push + SW */
  isSupported: boolean;
  /** true si l'utilisateur est déjà abonné */
  isSubscribed: boolean;
  /** true pendant une opération en cours */
  isLoading: boolean;
  /** Erreur survenue lors de la dernière opération */
  error: string | null;
  /** Demande la permission et abonne l'utilisateur */
  subscribe: () => Promise<void>;
  /** Désabonne l'utilisateur */
  unsubscribe: () => Promise<void>;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

/** Rejects with a readable message instead of leaving a spinner forever. */
function withTimeout<T>(promise: Promise<T>, ms: number, messageKey: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(i18n.t(messageKey))), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/**
 * Hook de gestion des notifications Push Web (WebPush / VAPID).
 *
 * 1. Enregistre le Service Worker (/sw.js)
 * 2. Récupère la clé VAPID publique depuis le backend
 * 3. Abonne / désabonne l'utilisateur
 * 4. Synchronise l'abonnement avec le backend
 *
 * Pré-requis backend :
 *  - VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY dans le .env
 *  - Endpoint /push/vapid-public-key, /push/subscribe, /push/unsubscribe
 */
export function usePushNotifications(): UsePushNotificationsReturn {
  const isSupported =
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window;

  const [permission, setPermission] = useState<PushPermission>(
    isSupported ? (Notification.permission as PushPermission) : 'unsupported',
  );
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);

  // Enregistre le SW et vérifie l'abonnement existant
  useEffect(() => {
    if (!isSupported) return;

    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then(async (reg) => {
        setRegistration(reg);
        const existing = await reg.pushManager.getSubscription();
        setIsSubscribed(!!existing);
      })
      .catch((err) => {
        console.error('[Push] SW registration failed:', err);
        setError(i18n.t('push.serviceWorkerFailed', { reason: err instanceof Error ? err.message : String(err) }));
      });
  }, [isSupported]);

  const subscribe = useCallback(async () => {
    if (!isSupported) return;
    if (!registration) {
      // The worker could not be registered (typically an untrusted HTTPS certificate): say so.
      setError((current) => current ?? i18n.t('push.serviceWorkerFailed', { reason: '-' }));
      return;
    }
    setIsLoading(true);
    setError(null);

    try {
      // 1. Demander la permission
      const perm = await withTimeout(Notification.requestPermission(), 45_000, 'push.permissionTimeout');
      setPermission(perm as PushPermission);
      if (perm !== 'granted') {
        setError(i18n.t('push.permissionDenied'));
        return;
      }

      // 2. Récupérer la clé VAPID publique
      const { publicKey } = await withTimeout(pushApi.getVapidPublicKey(), 15_000, 'push.serverTimeout');
      if (!publicKey) {
        setError(i18n.t('push.notConfigured'));
        return;
      }

      // 3. Créer l'abonnement PushManager
      const subscription = await withTimeout(
        registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        }),
        20_000,
        'push.browserServiceTimeout',
      );

      // 4. Envoyer l'abonnement au backend
      await pushApi.subscribe(subscription.toJSON());
      setIsSubscribed(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : i18n.t('common.unknownError');
      console.error('[Push] subscribe error:', msg);
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [isSupported, registration]);

  const unsubscribe = useCallback(async () => {
    if (!isSupported || !registration) return;
    setIsLoading(true);
    setError(null);

    try {
      const subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        setIsSubscribed(false);
        return;
      }

      // Informe le backend avant de supprimer côté navigateur
      await pushApi.unsubscribe(subscription.endpoint);
      await subscription.unsubscribe();
      setIsSubscribed(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : i18n.t('common.unknownError');
      console.error('[Push] unsubscribe error:', msg);
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [isSupported, registration]);

  return {
    permission,
    isSupported,
    isSubscribed,
    isLoading,
    error,
    subscribe,
    unsubscribe,
  };
}
