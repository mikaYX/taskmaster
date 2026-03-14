import { Injectable, Logger } from '@nestjs/common';
import type { EmailProvider, EmailOptions } from '../email.interface';

/**
 * SendGrid Email Provider.
 *
 * Sends emails via SendGrid API.
 * Optional provider - requires @sendgrid/mail package.
 */
@Injectable()
export class SendGridProvider implements EmailProvider {
  readonly name = 'sendgrid';
  private readonly logger = new Logger(SendGridProvider.name);
  private client: unknown = null;

  configure(config: { apiKey: string }): void {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const sgMail = require('@sendgrid/mail');
      sgMail.setApiKey(config.apiKey);
      this.client = sgMail;
    } catch {
      this.logger.warn('SendGrid package not installed, provider unavailable');
    }
  }

  async send(options: EmailOptions): Promise<boolean> {
    if (!this.client) {
      this.logger.error('SendGrid client not configured');
      return false;
    }

    try {
      const client = this.client as {
        send: (data: unknown) => Promise<unknown>;
      };
      await client.send({
        from: options.from,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
      });
      this.logger.log(`Email sent via SendGrid`);
      return true;
    } catch (error) {
      this.logger.error('Failed to send email via SendGrid', error);
      return false;
    }
  }

  async testConnection(): Promise<boolean> {
    return this.client !== null;
  }
}
