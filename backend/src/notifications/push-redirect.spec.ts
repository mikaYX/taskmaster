import { EventEmitter } from 'node:events';
import * as https from 'https';
const webpush = jest.requireActual<typeof import('web-push')>('web-push');

jest.mock('https', () => ({
  ...jest.requireActual('https'),
  request: jest.fn(),
}));

describe('web-push redirect policy', () => {
  it.each([301, 302, 303, 307, 308])(
    'rejects HTTP %s without contacting the private Location',
    async (statusCode) => {
      const request = Object.assign(new EventEmitter(), {
        end: jest.fn(),
        write: jest.fn(),
      });
      (https.request as jest.Mock).mockImplementation(
        (_options: unknown, onResponse: (response: EventEmitter) => void) => {
          const response = Object.assign(new EventEmitter(), {
            statusCode,
            headers: { location: 'https://169.254.169.254/metadata' },
          });
          request.end.mockImplementation(() => {
            onResponse(response);
            response.emit('end');
          });
          return request;
        },
      );
      const details = jest
        .spyOn(webpush, 'generateRequestDetails')
        .mockReturnValue({
          endpoint: 'https://push.example/send',
          method: 'POST',
          headers: {},
        } as never);
      try {
        await expect(
          webpush.sendNotification({
            endpoint: 'https://push.example/send',
            keys: { p256dh: 'key', auth: 'key' },
          }),
        ).rejects.toMatchObject({ statusCode });
        expect(https.request).toHaveBeenCalledTimes(1);
      } finally {
        details.mockRestore();
        jest.clearAllMocks();
      }
    },
  );
});
