import {
  Module,
  Global,
  OnModuleDestroy,
  Inject,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export const REDIS_CLIENT = 'REDIS_CLIENT';

const logger = new Logger('RedisModule');

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: (configService: ConfigService) => {
        const redisUrl = configService.get<string>(
          'REDIS_URL',
          'redis://redis:6379',
        );
        const redis = new Redis(redisUrl, {
          connectTimeout: 10_000,
          // Reconnect forever, but never wait more than 5 s between attempts.
          retryStrategy: (times) => Math.min(times * 500, 5_000),
        });

        // While Redis is down every reconnection attempt emits the same error: log it once.
        let lastError: string | undefined;
        redis.on('error', (err: Error) => {
          if (err.message === lastError) return;
          lastError = err.message;
          logger.error(`Redis connection error: ${err.message}`);
        });
        redis.on('ready', () => {
          if (lastError) logger.log('Redis connection restored');
          lastError = undefined;
        });

        return redis;
      },
      inject: [ConfigService],
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule implements OnModuleDestroy {
  constructor(@Inject(REDIS_CLIENT) private readonly redisClient: Redis) {}

  async onModuleDestroy() {
    await this.redisClient.quit();
  }
}
