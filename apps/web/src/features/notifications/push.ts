import { pushKeyResponseSchema } from '@acu/shared';
import { apiRequest } from '../../lib/api';

/** What stands between this browser and push notifications, if anything. */
export type PushState =
  | 'unsupported'
  /** The server has no push keys: in-app notifications only. */
  | 'unavailable'
  /** The person refused notifications in the browser; only they can change that. */
  | 'blocked'
  | 'off'
  | 'on';

function supported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

/** The service worker shows notifications while the page is closed; registering it is harmless. */
async function registration(): Promise<ServiceWorkerRegistration> {
  return navigator.serviceWorker.register('/sw.js', { scope: '/' });
}

function decodeKey(base64Url: string): Uint8Array<ArrayBuffer> {
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let index = 0; index < raw.length; index += 1) {
    bytes[index] = raw.charCodeAt(index);
  }
  return bytes;
}

export async function pushState(available: boolean): Promise<PushState> {
  if (!supported()) {
    return 'unsupported';
  }
  if (!available) {
    return 'unavailable';
  }
  if (Notification.permission === 'denied') {
    return 'blocked';
  }
  const existing = await navigator.serviceWorker.getRegistration('/');
  const subscription = await existing?.pushManager.getSubscription();
  return subscription ? 'on' : 'off';
}

/** Asks the browser's permission, subscribes, and tells the server where to send. */
export async function enablePush(locale: 'ar' | 'en'): Promise<PushState> {
  if (!supported()) {
    return 'unsupported';
  }
  const { publicKey } = await apiRequest('/api/notifications/push-key', {
    schema: pushKeyResponseSchema,
  });
  if (!publicKey) {
    return 'unavailable';
  }
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return permission === 'denied' ? 'blocked' : 'off';
  }
  const worker = await registration();
  await navigator.serviceWorker.ready;
  const subscription =
    (await worker.pushManager.getSubscription()) ??
    (await worker.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: decodeKey(publicKey),
    }));
  await apiRequest('/api/notifications/subscriptions', {
    method: 'POST',
    body: { subscription: subscription.toJSON(), locale },
  });
  return 'on';
}

export async function disablePush(): Promise<PushState> {
  const existing = await navigator.serviceWorker.getRegistration('/');
  const subscription = await existing?.pushManager.getSubscription();
  if (subscription) {
    await apiRequest('/api/notifications/subscriptions/remove', {
      method: 'POST',
      body: { endpoint: subscription.endpoint },
    });
    await subscription.unsubscribe();
  }
  return 'off';
}
