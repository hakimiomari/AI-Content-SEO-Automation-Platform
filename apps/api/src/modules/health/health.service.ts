import { Inject, Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../redis/redis.constants';

export type CheckStatus = 'up' | 'down';

export interface HealthCheck {
  status: CheckStatus;
  latencyMs: number;
  error?: string;
}

export interface HealthReport {
  status: 'ok' | 'degraded';
  uptime: number;
  timestamp: string;
  checks: {
    database: HealthCheck;
    redis: HealthCheck;
  };
}

const CHECK_TIMEOUT_MS = 2_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async check(): Promise<HealthReport> {
    const [database, redis] = await Promise.all([this.checkDatabase(), this.checkRedis()]);
    const healthy = database.status === 'up' && redis.status === 'up';
    return {
      status: healthy ? 'ok' : 'degraded',
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      checks: { database, redis },
    };
  }

  private async checkDatabase(): Promise<HealthCheck> {
    return this.run(() => this.prisma.$queryRaw`SELECT 1`);
  }

  private async checkRedis(): Promise<HealthCheck> {
    return this.run(async () => {
      if (this.redis.status === 'wait') await this.redis.connect();
      const reply = await this.redis.ping();
      if (reply !== 'PONG') throw new Error(`Unexpected PING reply: ${reply}`);
    });
  }

  private async run(fn: () => Promise<unknown>): Promise<HealthCheck> {
    const started = Date.now();
    try {
      await withTimeout(fn(), CHECK_TIMEOUT_MS);
      return { status: 'up', latencyMs: Date.now() - started };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Health check failed: ${message}`);
      return { status: 'down', latencyMs: Date.now() - started, error: message };
    }
  }
}
