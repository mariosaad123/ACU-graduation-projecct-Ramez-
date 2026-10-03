import webPush from 'web-push';

export interface PushMessage {
  title: string;
  body: string;
  /** Opened when the notification is clicked. */
  url: string;
  /** Notifications with the same tag replace each other instead of piling up. */
  tag: string;
}

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** gone: the browser dropped the subscription, so it should be deleted. */
export type PushOutcome = 'sent' | 'gone' | 'failed';

export interface PushSender {
  /** The VAPID public key browsers subscribe with; null when push is not configured. */
  readonly publicKey: string | null;
  send(target: PushTarget, message: PushMessage): Promise<PushOutcome>;
}

/** Web Push with VAPID keys: works with Chrome, Edge, Firefox and Safari 16.4+. */
export class WebPushSender implements PushSender {
  constructor(
    readonly publicKey: string,
    private readonly privateKey: string,
    private readonly subject: string,
  ) {}

  async send(target: PushTarget, message: PushMessage): Promise<PushOutcome> {
    try {
      await webPush.sendNotification(
        { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
        JSON.stringify(message),
        {
          vapidDetails: {
            subject: this.subject,
            publicKey: this.publicKey,
            privateKey: this.privateKey,
          },
          // A notification older than a day is no longer worth showing.
          TTL: 24 * 60 * 60,
          urgency: 'normal',
        },
      );
      return 'sent';
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      return status === 404 || status === 410 ? 'gone' : 'failed';
    }
  }
}

/** Push turned off: nothing is sent, and the web app does not offer to subscribe. */
export const NO_PUSH: PushSender = {
  publicKey: null,
  send: () => Promise.resolve('failed'),
};

/** Records what would be sent, for tests. */
export class MemoryPushSender implements PushSender {
  readonly publicKey = 'test-public-key';
  readonly sent: { endpoint: string; message: PushMessage }[] = [];
  /** Endpoints the "browser" has dropped. */
  readonly gone = new Set<string>();

  send(target: PushTarget, message: PushMessage): Promise<PushOutcome> {
    if (this.gone.has(target.endpoint)) {
      return Promise.resolve('gone');
    }
    this.sent.push({ endpoint: target.endpoint, message });
    return Promise.resolve('sent');
  }
}
