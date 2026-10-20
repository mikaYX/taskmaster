import { BadRequestException } from '@nestjs/common';
import { EmailService } from './email.service';
import { describeEmailError } from './email-errors';

describe('describeEmailError', () => {
  it.each([
    [{ code: 'EAUTH', message: 'Invalid login' }, /Authentication refused/],
    [{ code: 'ENOTFOUND', message: 'getaddrinfo' }, /host not found/],
    [{ code: 'ECONNREFUSED', message: 'refused' }, /Connection refused/],
    [{ code: 'ETIMEDOUT', message: 'timeout' }, /in time/],
    [{ message: 'self-signed certificate' }, /TLS\/certificate/],
    [{ code: 'EENVELOPE', message: 'No recipients' }, /rejected/],
  ])('explains %j', (error, expected) => {
    expect(describeEmailError(error)).toMatch(expected);
  });

  it('keeps the first line of an unknown error', () => {
    expect(describeEmailError(new Error('boom\nstack'))).toBe('boom');
  });
});

describe('EmailService failures are reported, not swallowed', () => {
  const settings = { getRawValue: jest.fn() };
  const provider = {
    name: 'smtp',
    lastError: null as string | null,
    configure: jest.fn(),
    send: jest.fn(),
    testConnection: jest.fn(),
  };
  const service = new EmailService(
    settings as never,
    provider as never,
    {} as never,
    {} as never,
    {} as never,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    provider.lastError = null;
    settings.getRawValue.mockImplementation(async (key: string) => {
      const values: Record<string, unknown> = {
        'email.provider': 'smtp',
        'email.smtp.host': 'smtp.example.com',
        'email.smtp.port': 587,
        'email.smtp.user': 'u',
        'email.smtp.password': 'p',
        'email.from': 'noreply@example.com',
      };
      return values[key];
    });
  });

  it('answers a failed test email with the reason, not a success', async () => {
    provider.send.mockImplementation(async () => {
      provider.lastError = 'Authentication refused by the mail server';
      return false;
    });

    await expect(service.sendTest(['a@example.com'])).rejects.toThrow(
      /Test email not sent via smtp: Authentication refused/,
    );
  });

  it('still answers success when the mail left', async () => {
    provider.send.mockResolvedValue(true);

    await expect(service.sendTest(['a@example.com'])).resolves.toEqual({
      success: true,
      provider: 'smtp',
    });
  });

  it('reports a failed connection test with its reason', async () => {
    provider.testConnection.mockImplementation(async () => {
      provider.lastError = 'Connection refused by the mail server';
      return false;
    });

    await expect(service.testConnection()).rejects.toThrow(
      /Connection test failed via smtp: Connection refused/,
    );
  });

  it('tells the admin to re-enter a credential that cannot be decrypted', async () => {
    settings.getRawValue.mockImplementation(async (key: string) => {
      if (key === 'email.smtp.password')
        throw new Error('Failed to decrypt value');
      return key === 'email.provider' ? 'smtp' : 'smtp.example.com';
    });

    const failure = service.sendTest(['a@example.com']);
    await expect(failure).rejects.toBeInstanceOf(BadRequestException);
    await expect(failure).rejects.toThrow(
      /enter the password \/ API key again/,
    );
  });
});
