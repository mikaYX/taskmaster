import { Injectable, Logger } from '@nestjs/common';
import { EmailService } from '../email/email.service';
import { SettingsService } from '../settings/settings.service';
import type { SettingKey } from '../settings/settings.registry';
import {
  renderCredentialsEmail,
  resolveEmailLogoUrl,
  type CredentialsEmailReason,
} from './credentials-email.template';

export type { CredentialsEmailReason };

/**
 * Outcome reported to the admin after creating or resetting an account:
 * - SENT: the mail was handed to the provider
 * - FAILED: email is active but the provider rejected it / was unreachable
 * - NOT_ACTIVE: email is disabled or misconfigured, nothing was attempted
 * - NO_ADDRESS: the account has no email address to write to
 */
export type WelcomeEmailStatus =
  'SENT' | 'FAILED' | 'NOT_ACTIVE' | 'NO_ADDRESS';

/**
 * Sends the credentials of a freshly created or reset local account.
 * The password is temporary: both flows set mustChangePassword.
 */
@Injectable()
export class UserWelcomeEmailService {
  private readonly logger = new Logger(UserWelcomeEmailService.name);

  constructor(
    private readonly emailService: EmailService,
    private readonly settings: SettingsService,
  ) {}

  async isAvailable(): Promise<boolean> {
    try {
      const status = await this.emailService.getConfigStatus();
      return status.enabled && status.configValid;
    } catch (error) {
      this.logger.warn(`Email status check failed: ${error.message}`);
      return false;
    }
  }

  async sendCredentials(
    user: {
      username: string;
      fullname: string | null;
      email: string | null;
      temporaryPassword: string;
    },
    reason: CredentialsEmailReason = 'CREATED',
  ): Promise<WelcomeEmailStatus> {
    if (!user.email) return 'NO_ADDRESS';
    if (!(await this.isAvailable())) return 'NOT_ACTIVE';

    try {
      const loginUrl =
        process.env.FRONTEND_URL || process.env.BACKEND_URL || '';
      const [title, logo] = await Promise.all([
        this.readSetting('app.title'),
        this.readSetting('app.logoUrl'),
      ]);

      const mail = renderCredentialsEmail({
        reason,
        name: user.fullname || user.username,
        login: user.username,
        password: user.temporaryPassword,
        appTitle: title || 'Taskmaster',
        loginUrl: loginUrl || undefined,
        logoUrl: resolveEmailLogoUrl(logo, loginUrl) ?? undefined,
      });

      const sent = await this.emailService.send({
        to: user.email,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
      });
      return sent ? 'SENT' : 'FAILED';
    } catch (error) {
      this.logger.error(`Credentials email failed: ${error.message}`);
      return 'FAILED';
    }
  }

  /** Branding is cosmetic: a missing setting must never block the email. */
  private async readSetting(key: SettingKey): Promise<string> {
    try {
      const value = await this.settings.getRawValue<string>(key);
      return typeof value === 'string' ? value : '';
    } catch {
      return '';
    }
  }
}
