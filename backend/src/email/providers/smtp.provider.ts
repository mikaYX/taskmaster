import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import type { EmailProvider, EmailOptions } from '../email.interface';

/**
 * SMTP Email Provider.
 *
 * Sends emails via SMTP using nodemailer.
 * Credentials retrieved from Settings.
 */
@Injectable()
export class SmtpProvider implements EmailProvider {
  readonly name = 'smtp';
  private readonly logger = new Logger(SmtpProvider.name);
  private transporter: Transporter | null = null;

  /**
   * Initialize transporter with config.
   */
  configure(config: {
    host: string;
    port: number;
    user: string;
    password: string;
    secure?: boolean;
  }): void {
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure ?? config.port === 465,
      auth: {
        user: config.user,
        pass: config.password,
      },
    });
  }

  async send(options: EmailOptions): Promise<boolean> {
    if (!this.transporter) {
      this.logger.error('SMTP transporter not configured');
      return false;
    }

    try {
      await this.transporter.sendMail({
        from: options.from,
        to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
      });
      this.logger.log(
        `Email sent to ${Array.isArray(options.to) ? options.to.length : 1} recipient(s)`,
      );
      return true;
    } catch (error) {
      this.logger.error('Failed to send email via SMTP', error);
      return false;
    }
  }

  async testConnection(): Promise<boolean> {
    if (!this.transporter) {
      return false;
    }

    try {
      await this.transporter.verify();
      return true;
    } catch (error) {
      this.logger.error('SMTP connection test failed', error);
      return false;
    }
  }
}
