import nodemailer from 'nodemailer';
import type { Env } from '../../config/env';
import type { Logger } from '../../lib/logger';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface Mailer {
  send: (message: MailMessage) => Promise<void>;
}

/** Development: prints the message instead of sending it, so codes can be read from the terminal. */
export function createConsoleMailer(logger: Logger): Mailer {
  return {
    send(message) {
      logger.info(
        { to: message.to, subject: message.subject },
        `Email (not sent)\n${message.text}`,
      );
      return Promise.resolve();
    },
  };
}

export function createSmtpMailer(smtpUrl: string, from: string): Mailer {
  const transport = nodemailer.createTransport(smtpUrl);
  return {
    async send(message) {
      await transport.sendMail({ from, ...message });
    },
  };
}

export function createMailer(env: Env, logger: Logger): Mailer {
  if (env.MAIL_TRANSPORT === 'smtp' && env.SMTP_URL) {
    return createSmtpMailer(env.SMTP_URL, env.MAIL_FROM);
  }
  return createConsoleMailer(logger);
}
