import { UserWelcomeEmailService } from './user-welcome-email.service';
import { resolveEmailLogoUrl } from './credentials-email.template';

describe('UserWelcomeEmailService', () => {
  const emailService = {
    getConfigStatus: jest.fn(),
    send: jest.fn(),
  };
  const settings = { getRawValue: jest.fn() };
  const service = new UserWelcomeEmailService(
    emailService as never,
    settings as never,
  );
  const user = {
    username: 'jane@example.com',
    fullname: 'Jane <b>Doe</b>',
    email: 'jane@example.com',
    temporaryPassword: 'Tmp<pw>&1',
  };
  const originalFrontendUrl = process.env.FRONTEND_URL;

  beforeEach(() => {
    jest.resetAllMocks();
    process.env.FRONTEND_URL = 'https://taches.example.com';
    emailService.getConfigStatus.mockResolvedValue({
      enabled: true,
      configValid: true,
      provider: 'smtp',
    });
    emailService.send.mockResolvedValue(true);
    settings.getRawValue.mockImplementation(async (key: string) =>
      key === 'app.title' ? 'Dermscan Tasks' : '/uploads/logo.png',
    );
  });

  afterAll(() => {
    if (originalFrontendUrl === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = originalFrontendUrl;
  });

  it('sends an HTML mail with a text alternative and reports SENT', async () => {
    await expect(service.sendCredentials(user)).resolves.toBe('SENT');

    const mail = emailService.send.mock.calls[0][0];
    expect(mail.to).toBe('jane@example.com');
    expect(mail.html).toContain('<table');
    expect(mail.html).toContain('Dermscan Tasks');
    expect(mail.html).toContain('href="https://taches.example.com"');
    expect(mail.text).toContain('Tmp<pw>&1');
  });

  it('shows the branded logo when it is reachable from outside', async () => {
    await service.sendCredentials(user);

    const { html } = emailService.send.mock.calls[0][0];
    expect(html).toContain('src="https://taches.example.com/uploads/logo.png"');
  });

  it('falls back to the title when branding cannot be read', async () => {
    settings.getRawValue.mockRejectedValue(new Error('db down'));

    await expect(service.sendCredentials(user)).resolves.toBe('SENT');
    const { html } = emailService.send.mock.calls[0][0];
    expect(html).toContain('Taskmaster');
    expect(html).not.toContain('<img');
  });

  it('uses the password-reset wording for a reset', async () => {
    await expect(service.sendCredentials(user, 'RESET')).resolves.toBe('SENT');

    const mail = emailService.send.mock.calls[0][0];
    expect(mail.subject).toContain('réinitialisé');
    expect(mail.text).toContain('réinitialisé par un administrateur');
  });

  it('escapes user-controlled values in the HTML body', async () => {
    await service.sendCredentials(user);

    const { html } = emailService.send.mock.calls[0][0];
    expect(html).not.toContain('<b>Doe</b>');
    expect(html).toContain('Tmp&lt;pw&gt;&amp;1');
  });

  it('reports NOT_ACTIVE without sending when email is disabled', async () => {
    emailService.getConfigStatus.mockResolvedValue({
      enabled: false,
      configValid: false,
      provider: 'smtp',
    });

    await expect(service.sendCredentials(user)).resolves.toBe('NOT_ACTIVE');
    expect(emailService.send).not.toHaveBeenCalled();
  });

  it('reports NOT_ACTIVE when the provider is enabled but misconfigured', async () => {
    emailService.getConfigStatus.mockResolvedValue({
      enabled: true,
      configValid: false,
      provider: 'smtp',
    });

    await expect(service.isAvailable()).resolves.toBe(false);
  });

  it('reports NO_ADDRESS when the account has no email', async () => {
    await expect(
      service.sendCredentials({ ...user, email: null }),
    ).resolves.toBe('NO_ADDRESS');
    expect(emailService.send).not.toHaveBeenCalled();
  });

  it('reports FAILED when the provider rejects or throws', async () => {
    emailService.send.mockResolvedValueOnce(false);
    await expect(service.sendCredentials(user)).resolves.toBe('FAILED');

    emailService.send.mockRejectedValueOnce(new Error('smtp down'));
    await expect(service.sendCredentials(user)).resolves.toBe('FAILED');
  });
});

describe('resolveEmailLogoUrl', () => {
  const base = 'https://taches.example.com';

  it('resolves relative uploads against the public URL', () => {
    expect(resolveEmailLogoUrl('/uploads/logo.png', base)).toBe(
      'https://taches.example.com/uploads/logo.png',
    );
  });

  it('keeps absolute http(s) URLs', () => {
    expect(resolveEmailLogoUrl('https://cdn.example.com/l.png', base)).toBe(
      'https://cdn.example.com/l.png',
    );
  });

  it.each([
    ['empty', ''],
    ['a data URI (blocked by Gmail/Outlook)', 'data:image/png;base64,AAAA'],
    ['a loopback host', 'http://localhost:3000/uploads/logo.png'],
    ['a non-http scheme', 'javascript:alert(1)'],
  ])('returns null for %s', (_label, value) => {
    expect(resolveEmailLogoUrl(value, base)).toBeNull();
  });

  it('returns null for a relative path when no public URL is known', () => {
    expect(resolveEmailLogoUrl('/uploads/logo.png', '')).toBeNull();
  });
});
