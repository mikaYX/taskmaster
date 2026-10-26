import { BadRequestException } from '@nestjs/common';
import { GlobalValidationPipe } from '../common';
import {
  SubscribePushDto,
  UnsubscribePushDto,
} from './dto/push-subscription.dto';

const pipe = new GlobalValidationPipe();
const body = (metatype: new () => object, value: unknown) =>
  pipe.transform(value, { type: 'body', metatype });

const subscription = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/dQw4w9WgXcQ:APA91bE-example',
  keys: {
    p256dh:
      'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
    auth: 'tBHItJI5svbpez7KI4CCXg',
  },
};

describe('push subscription DTOs (validated by the global pipe)', () => {
  it('accepts what PushSubscription.toJSON() sends', async () => {
    await expect(body(SubscribePushDto, subscription)).resolves.toMatchObject(
      subscription,
    );
  });

  it('rejects a non-https endpoint', async () => {
    await expect(
      body(SubscribePushDto, {
        ...subscription,
        endpoint: 'http://push.example/x',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each([
    ['missing keys', { endpoint: subscription.endpoint }],
    ['missing auth', { ...subscription, keys: { p256dh: 'abc' } }],
    ['unknown property', { ...subscription, admin: true }],
  ])('rejects %s', async (_name, payload) => {
    await expect(body(SubscribePushDto, payload)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('validates the unsubscribe endpoint', async () => {
    await expect(
      body(UnsubscribePushDto, { endpoint: subscription.endpoint }),
    ).resolves.toBeDefined();
    await expect(body(UnsubscribePushDto, {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
