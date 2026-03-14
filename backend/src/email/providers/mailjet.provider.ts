import { Injectable, Logger } from '@nestjs/common';
import type { EmailProvider, EmailOptions } from '../email.interface';

/**
 * Mailjet Email Provider.
 *
 * Sends emails via Mailjet API.
 * Optional provider - requires node-mailjet package.
 */
@Injectable()
export class MailjetProvider implements EmailProvider {
  readonly name = 'mailjet';
  private readonly logger = new Logger(MailjetProvider.name);
  private client: unknown = null;

  configure(config: { apiKey: string; secretKey: string }): void {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Mailjet = require('node-mailjet');
      this.client = Mailjet.apiConnect(config.apiKey, config.secretKey);
    } catch {
      this.logger.warn('Mailjet package not installed, provider unavailable');
    }
  }

  async send(options: EmailOptions): Promise<boolean> {
    if (!this.client) {
      this.logger.error('Mailjet client not configured');
      return false;
    }

    try {
      const client = this.client as {
        post: (endpoint: string) => {
          request: (data: unknown) => Promise<unknown>;
        };
      };
      const recipients = Array.isArray(options.to)
        ? options.to.map((email) => ({ Email: email }))
        : [{ Email: options.to }];

      await client.post('send').request({
        FromEmail: options.from,
        Subject: options.subject,
        'Html-part': options.html,
        'Text-part': options.text,
        Recipients: recipients,
      });

      this.logger.log(`Email sent via Mailjet`);
      return true;
    } catch (error) {
      this.logger.error('Failed to send email via Mailjet', error);
      return false;
    }
  }

  async testConnection(): Promise<boolean> {
    return this.client !== null;
  }
}
