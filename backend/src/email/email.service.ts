import {
  Injectable,
  Logger,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { SettingsService } from '../settings';
import type { EmailProvider, EmailOptions } from './email.interface';
import {
  SmtpProvider,
  MailgunProvider,
  MailjetProvider,
  SendGridProvider,
} from './providers';
import CircuitBreaker from 'opossum';

/**
 * Email Service.
 *
 * Orchestrates email sending via configured provider.
 * Provider selection via Settings.
 * No business logic - just email sending.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private breaker: CircuitBreaker;

  constructor(
    @Inject(forwardRef(() => SettingsService))
    private readonly settings: SettingsService,
    private readonly smtpProvider: SmtpProvider,
    private readonly mailgunProvider: MailgunProvider,
    private readonly mailjetProvider: MailjetProvider,
    private readonly sendgridProvider: SendGridProvider,
  ) {
    // Initialize Circuit Breaker
    // Options: timeout 10s, errorThreshold 50%, resetTimeout 30s
    this.breaker = new CircuitBreaker(
      async (provider: EmailProvider, options: any) => {
        return provider.send(options);
      },
      {
        timeout: 10000,
        errorThresholdPercentage: 50,
        resetTimeout: 30000,
        name: 'email-provider',
      },
    );

    this.breaker.fallback(() => {
      this.logger.error(
        'Circuit Breaker Open: Email sending fallback triggered.',
      );
      return false; // Fail gracefully or queue for later? For now, return false.
    });

    this.breaker.on('open', () =>
      this.logger.warn('Email Circuit Breaker OPENED'),
    );
    this.breaker.on('close', () =>
      this.logger.log('Email Circuit Breaker CLOSED'),
    );
  }

  /**
   * Send an email using the configured provider.
   */
  async send(options: EmailOptions): Promise<boolean> {
    const enabled = await this.settings.getRawValue<boolean>('email.enabled');
    if (!enabled) {
      this.logger.warn('Email sending is disabled');
      return false;
    }

    const provider = await this.getConfiguredProvider();
    const from =
      options.from || (await this.settings.getRawValue<string>('email.from'));

    // Fire Circuit Breaker
    try {
      return (await this.breaker.fire(provider, {
        ...options,
        from,
      })) as boolean;
    } catch (error) {
      this.logger.error(`Email sending failed via Breaker: ${error.message}`);
      return false;
    }
  }

  /**
   * Send a test email.
   */
  async sendTest(
    to: string[],
    subject?: string,
    body?: string,
  ): Promise<{ success: boolean; provider: string }> {
    const provider = await this.getConfiguredProvider();

    const from = await this.settings.getRawValue<string>('email.from');
    const success = await provider.send({
      to,
      from,
      subject: subject || 'Taskmaster - Test Email',
      html:
        body ||
        '<h1>Test Email</h1><p>This is a test email from Taskmaster.</p>',
      text: body || 'Test Email - This is a test email from Taskmaster.',
    });

    return { success, provider: provider.name };
  }

  /**
   * Test the current provider connection.
   */
  async testConnection(): Promise<{ success: boolean; provider: string }> {
    const provider = await this.getConfiguredProvider();
    const success = await provider.testConnection();
    return { success, provider: provider.name };
  }

  /**
   * Check if email feature is enabled and properly configured.
   * Used by MFA Email OTP to determine availability.
   */
  async getConfigStatus(): Promise<{
    enabled: boolean;
    configValid: boolean;
    provider: string;
  }> {
    const enabled = await this.settings.getRawValue<boolean>('email.enabled');
    const providerName =
      await this.settings.getRawValue<string>('email.provider');

    if (!enabled) {
      return { enabled: false, configValid: false, provider: providerName };
    }

    // Check if the current provider is properly configured
    const configValid = await this.isProviderConfigured(providerName);

    return { enabled, configValid, provider: providerName };
  }

  /**
   * Check if a specific provider has all required configuration.
   */
  private async isProviderConfigured(providerName: string): Promise<boolean> {
    try {
      const from = await this.settings.getRawValue<string>('email.from');
      if (!from) return false;

      switch (providerName) {
        case 'smtp': {
          const host =
            await this.settings.getRawValue<string>('email.smtp.host');
          return !!host;
        }
        case 'mailgun': {
          const apiKey = await this.settings.getRawValue<string>(
            'email.mailgun.apiKey',
          );
          const domain = await this.settings.getRawValue<string>(
            'email.mailgun.domain',
          );
          return !!(apiKey && domain);
        }
        case 'mailjet': {
          const apiKey = await this.settings.getRawValue<string>(
            'email.mailjet.apiKey',
          );
          const secretKey = await this.settings.getRawValue<string>(
            'email.mailjet.secretKey',
          );
          return !!(apiKey && secretKey);
        }
        case 'sendgrid': {
          const apiKey = await this.settings.getRawValue<string>(
            'email.sendgrid.apiKey',
          );
          return !!apiKey;
        }
        default:
          return false;
      }
    } catch {
      return false;
    }
  }

  /**
   * Get the configured and initialized provider.
   */
  private async getConfiguredProvider(): Promise<EmailProvider> {
    const providerName =
      await this.settings.getRawValue<string>('email.provider');

    switch (providerName) {
      case 'smtp':
        await this.configureSmtp();
        return this.smtpProvider;

      case 'mailgun':
        await this.configureMailgun();
        return this.mailgunProvider;

      case 'mailjet':
        await this.configureMailjet();
        return this.mailjetProvider;

      case 'sendgrid':
        await this.configureSendgrid();
        return this.sendgridProvider;

      default:
        throw new BadRequestException(
          `Unknown email provider: ${providerName}`,
        );
    }
  }

  private async configureSmtp(): Promise<void> {
    const host = await this.settings.getRawValue<string>('email.smtp.host');
    const port = await this.settings.getRawValue<number>('email.smtp.port');
    const user = await this.settings.getRawValue<string>('email.smtp.user');
    const password = await this.settings.getRawValue<string>(
      'email.smtp.password',
    );

    if (!host) {
      throw new BadRequestException('SMTP host not configured');
    }

    this.smtpProvider.configure({ host, port, user, password });
  }

  private async configureMailgun(): Promise<void> {
    const apiKey = await this.settings.getRawValue<string>(
      'email.mailgun.apiKey',
    );
    const domain = await this.settings.getRawValue<string>(
      'email.mailgun.domain',
    );

    if (!apiKey || !domain) {
      throw new BadRequestException('Mailgun credentials not configured');
    }

    this.mailgunProvider.configure({ apiKey, domain });
  }

  private async configureMailjet(): Promise<void> {
    const apiKey = await this.settings.getRawValue<string>(
      'email.mailjet.apiKey',
    );
    const secretKey = await this.settings.getRawValue<string>(
      'email.mailjet.secretKey',
    );

    if (!apiKey || !secretKey) {
      throw new BadRequestException('Mailjet credentials not configured');
    }

    this.mailjetProvider.configure({ apiKey, secretKey });
  }

  private async configureSendgrid(): Promise<void> {
    const apiKey = await this.settings.getRawValue<string>(
      'email.sendgrid.apiKey',
    );

    if (!apiKey) {
      throw new BadRequestException('SendGrid API key not configured');
    }

    this.sendgridProvider.configure({ apiKey });
  }
}
