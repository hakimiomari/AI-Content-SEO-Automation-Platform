import { Redis } from 'ioredis';
import { config } from '../config';
import { logger } from './logger';

/**
 * Shared ioredis connection. BullMQ duplicates it internally for blocking commands, so a
 * single instance can be passed to every Worker / QueueEvents.
 * `maxRetriesPerRequest: null` is required by BullMQ.
 */
export const redis = new Redis(config.REDIS_URL, {
  maxRetriesPerRequest: null,
  retryStrategy: (times) => Math.min(times * 200, 5_000),
});

redis.on('error', (err) => logger.error({ err }, 'Redis connection error'));
redis.on('reconnecting', () => logger.warn('Redis reconnecting'));
redis.on('ready', () => logger.debug('Redis ready'));

export async function closeRedis(): Promise<void> {
  try {
    await redis.quit();
  } catch {
    redis.disconnect();
  }
}
