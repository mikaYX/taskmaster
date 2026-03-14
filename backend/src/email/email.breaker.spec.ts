import { Test, TestingModule } from '@nestjs/testing';
import { EmailService } from './email.service';
import { SettingsService } from '../settings';
import {
  SmtpProvider,
  MailgunProvider,
  MailjetProvider,
  SendGridProvider,
} from './providers';
import { ConfigService } from '@nestjs/config';

describe('EmailService Circuit Breaker', () => {
  let service: EmailService;
  let smtpProvider: SmtpProvider;

  const mockSettingsService = {
    getRawValue: jest.fn(),
  };

  const mockSmtpProvider = {
    name: 'smtp',
    send: jest.fn(),
    configure: jest.fn(),
    testConnection: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailService,
        { provide: SettingsService, useValue: mockSettingsService },
        { provide: SmtpProvider, useValue: mockSmtpProvider },
        { provide: MailgunProvider, useValue: {} },
        { provide: MailjetProvider, useValue: {} },
        { provide: SendGridProvider, useValue: {} },
        { provide: ConfigService, useValue: { get: jest.fn() } },
      ],
    }).compile();

    service = module.get<EmailService>(EmailService);
    smtpProvider = module.get<SmtpProvider>(SmtpProvider);

    // Reset mocks
    jest.clearAllMocks();

    // Mock Settings to enable email and use SMTP
    mockSettingsService.getRawValue.mockImplementation((key) => {
      if (key === 'email.enabled') return Promise.resolve(true);
      if (key === 'email.provider') return Promise.resolve('smtp');
      if (key === 'email.from')
        return Promise.resolve('noreply@taskmaster.com');
      if (key === 'email.smtp.host') return Promise.resolve('localhost');
      if (key === 'email.smtp.port') return Promise.resolve(587);
      if (key === 'email.smtp.user') return Promise.resolve('user');
      if (key === 'email.smtp.password') return Promise.resolve('pass');
      return Promise.resolve(null);
    });
  });

  it('should open circuit breaker after failures', async () => {
    // Arrange: Provider fails
    mockSmtpProvider.send.mockRejectedValue(new Error('SMTP Down'));

    // Act: Call send multiple times to trip breaker
    // Breaker configured with 50% threshold.
    // We'll fire 20 requests.
    let failureCount = 0;
    for (let i = 0; i < 20; i++) {
      const result = await service.send({
        to: ['test@example.com'],
        subject: 'Test',
        text: 'Body',
      });
      if (!result) failureCount++;
    }

    // Assert
    expect(failureCount).toBe(20);
    expect(mockSmtpProvider.send).toHaveBeenCalled();

    // Check if breaker is open (implementation detail: Opossum property or behavior)
    // We can verify valid calls are blocked immediately without provider call if we really want,
    // but verifying fallbacks and error handling is enough for "Proof".

    // In Opossum, after opening, it stops calling the provider.
    // Let's see how many times provider was actually called.
    // It likely won't be 20 if it opened early.
    // Threshold is 50%, volume threshold default is 10.
    // So after ~10 failures, it should open.
    console.log(
      `Provider called ${mockSmtpProvider.send.mock.calls.length} times`,
    );
    expect(mockSmtpProvider.send.mock.calls.length).toBeLessThan(20);
  });
});
