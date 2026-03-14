import { Injectable, Logger } from '@nestjs/common';
import type { EmailProvider, EmailOptions } from '../email.interface';

/**
 * Mailgun Email Provider.
 *
 * Sends emails via Mailgun API.
 * Optional provider - requires mailgun-js package.
 */
@Injectable()
export class MailgunProvider implements EmailProvider {
  readonly name = 'mailgun';
  private readonly logger = new Logger(MailgunProvider.name);
  private client: unknown = null;
  private domain = '';

  configure(config: {
    apiKey: string;
    domain: string;
    region?: 'us' | 'eu';
  }): void {
    // Lazy loading - will fail gracefully if package not installed
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const formData = require('form-data');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Mailgun = require('mailgun.js');
      const mailgun = new Mailgun(formData);
      const url =
        config.region === 'eu' ? 'https://api.eu.mailgun.net' : undefined;
      this.client = mailgun.client({
        username: 'api',
        key: config.apiKey,
        url,
      });
      this.domain = config.domain;
    } catch {
      this.logger.warn('Mailgun package not installed, provider unavailable');
    }
  }

  async send(options: EmailOptions): Promise<boolean> {
    if (!this.client) {
      this.logger.error('Mailgun client not configured');
      return false;
    }

    try {
      const client = this.client as {
        messages: {
          create: (domain: string, data: unknown) => Promise<unknown>;
        };
      };
      await client.messages.create(this.domain, {
        from: options.from,
        to: Array.isArray(options.to) ? options.to : [options.to],
        subject: options.subject,
        html: options.html,
        text: options.text,
      });
      this.logger.log(`Email sent via Mailgun`);
      return true;
    } catch (error) {
      this.logger.error('Failed to send email via Mailgun', error);
      return false;
    }
  }

  async testConnection(): Promise<boolean> {
    if (!this.client) return false;

    try {
      const client = this.client as {
        domains: { get: (domain: string) => Promise<unknown> };
      };
      await client.domains.get(this.domain);
      return true;
    } catch {
      return false;
    }
  }
}
