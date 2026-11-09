import { NotificationsService } from './notifications.service';
import { safeFetch } from '../common/utils/url-validator.util';

jest.mock('../common/utils/url-validator.util', () => ({
  safeFetch: jest.fn(),
}));

describe('notification HTTP failures', () => {
  const service = new NotificationsService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  const config = {
    webhookUrl: 'https://secret.example/token',
    botToken: 'secret',
    chatId: 'secret',
    headers: { Authorization: 'secret' },
  };
  const send = (channel: string) =>
    service['sendToChannel'](
      channel,
      config,
      {},
      'message',
      'task',
      'event',
      'subject',
      [],
    );
  const fetchMock = safeFetch as jest.Mock;
  let log: jest.SpyInstance;
  beforeEach(() => {
    fetchMock.mockReset();
    log = jest.spyOn(service['logger'], 'error').mockImplementation();
  });
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it.each(
    ['SLACK', 'TEAMS', 'TELEGRAM', 'DISCORD', 'WEBHOOK'].flatMap((channel) =>
      [400, 429, 500].map((status) => [channel, status] as const),
    ),
  )(
    '%s propagates and logs HTTP %s without secrets',
    async (channel, status) => {
      fetchMock.mockResolvedValue({
        ok: false,
        status,
        headers: new Headers(),
        statusText: 'secret',
        text: async () => 'secret',
      });
      await expect(send(channel)).rejects.toThrow(`${channel}: HTTP ${status}`);
      expect(log).toHaveBeenCalledWith(`${channel}: HTTP ${status}`);
      expect(JSON.stringify(log.mock.calls)).not.toContain('secret');
    },
  );

  it.each(['2', 'Mon, 09 Nov 2026 12:00:02 GMT'])(
    'waits for Retry-After %s before propagating 429',
    async (retryAfter) => {
      jest.useFakeTimers().setSystemTime(new Date('2026-11-09T12:00:00Z'));
      fetchMock.mockResolvedValue({
        ok: false,
        status: 429,
        headers: new Headers({ 'Retry-After': retryAfter }),
      });
      let settled = false;
      const result = send('SLACK').catch((error) => {
        settled = true;
        return error;
      });
      await jest.advanceTimersByTimeAsync(1999);
      expect(settled).toBe(false);
      await jest.advanceTimersByTimeAsync(1);
      expect(await result).toMatchObject({ message: 'SLACK: HTTP 429' });
    },
  );

  it.each(['SLACK', 'TEAMS', 'TELEGRAM', 'DISCORD', 'WEBHOOK'])(
    '%s accepts success',
    async (channel) => {
      fetchMock.mockResolvedValue({ ok: true, status: 204 });
      await expect(send(channel)).resolves.toBeUndefined();
      expect(log).not.toHaveBeenCalled();
    },
  );
});
