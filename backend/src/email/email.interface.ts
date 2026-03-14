/**
 * Email Provider Interface.
 *
 * All email providers must implement this interface.
 * Providers are responsible only for sending emails.
 * No business logic allowed.
 */
export interface EmailProvider {
  /**
   * Provider name for identification.
   */
  readonly name: string;

  /**
   * Send an email.
   *
   * @param options Email options
   * @returns true if sent successfully
   */
  send(options: EmailOptions): Promise<boolean>;

  /**
   * Test the connection/configuration.
   *
   * @returns true if connection is valid
   */
  testConnection(): Promise<boolean>;
}

/**
 * Email options for sending.
 */
export interface EmailOptions {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  from?: string; // Override default from
}

/**
 * Email provider configuration from Settings.
 */
export interface EmailProviderConfig {
  provider: 'smtp' | 'mailgun' | 'mailjet' | 'sendgrid';
  smtp?: {
    host: string;
    port: number;
    user: string;
    password: string;
    secure?: boolean;
  };
  mailgun?: {
    apiKey: string;
    domain: string;
    region?: 'us' | 'eu';
  };
  mailjet?: {
    apiKey: string;
    secretKey: string;
  };
  sendgrid?: {
    apiKey: string;
  };
  from: string;
}

export const EMAIL_PROVIDER = Symbol('EMAIL_PROVIDER');
