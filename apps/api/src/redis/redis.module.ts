import { Global, Inject, Logger, Module, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { AppConfig } from '../config/configuration';
import { REDIS_CLIENT } from './redis.constants';

export function createRedisClient(url: string): Redis {
  return new Redis(url, {
    lazyConnect: true,
    // Required by BullMQ; also avoids throwing on transient reconnects.
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    retryStrategy: (times) => Math.min(times * 200, 5_000),
  });
}

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [AppConfig],
      useFactory: (config: AppConfig): Redis => {
        const logger = new Logger('Redis');
        const client = createRedisClient(config.redisUrl);
        client.on('error', (err) => logger.error(`Redis error: ${err.message}`));
        client.on('ready', () => logger.log('Connected to Redis'));
        return client;
      },
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule implements OnModuleDestroy {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async onModuleDestroy(): Promise<void> {
    if (this.redis.status !== 'end') {
      await this.redis.quit().catch(() => this.redis.disconnect());
    }
  }
}
