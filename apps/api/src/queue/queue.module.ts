import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUES } from '@acsp/shared';
import { AppConfig } from '../config/configuration';
import { QueueService } from './queue.service';

export const ALL_QUEUE_NAMES = Object.values(QUEUES);

/**
 * Registers every queue declared in `@acsp/shared`. The API only enqueues jobs;
 * processors live in `apps/worker`.
 */
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) => {
        const url = new URL(config.redisUrl);
        return {
          connection: {
            host: url.hostname,
            port: Number(url.port || 6379),
            username: url.username || undefined,
            password: url.password || undefined,
            db: url.pathname && url.pathname !== '/' ? Number(url.pathname.slice(1)) : 0,
            tls: url.protocol === 'rediss:' ? {} : undefined,
            maxRetriesPerRequest: null,
          },
          prefix: 'acsp',
        };
      },
    }),
    ...ALL_QUEUE_NAMES.map((name) => BullModule.registerQueue({ name })),
  ],
  providers: [QueueService],
  exports: [QueueService, BullModule],
})
export class QueueModule {}
