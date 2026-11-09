import { NotificationsService } from './notifications.service';
import { safeFetch } from '../common/utils/url-validator.util';

jest.mock('../common/utils/url-validator.util', () => ({
  safeFetch: jest.fn(),
}));

describe('webhook JSON template', () => {
  const service = new NotificationsService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  it.each([
    'a "quote"',
    'line one\nline two\r\n',
    'Été 日本語 🚨',
    '", "injected": true, "x": "',
    '$& {{taskName}}',
  ])('preserves the value %j and JSON structure', async (value) => {
    (safeFetch as jest.Mock).mockResolvedValue({ ok: true });
    await service['sendWebhook'](
      {
        webhookUrl: 'https://example.com',
        payloadTemplate: {
          message: '{{message}}',
          nested: ['{{taskName}}', { event: '{{eventLabel}}' }],
          count: 1,
          enabled: true,
        },
      },
      value,
      value,
      value,
    );
    const body = (safeFetch as jest.Mock).mock.calls.at(-1)[1].body;
    expect(JSON.parse(body)).toEqual({
      message: value,
      nested: [value, { event: value }],
      count: 1,
      enabled: true,
    });
  });
});
