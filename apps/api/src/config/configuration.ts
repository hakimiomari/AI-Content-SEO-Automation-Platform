import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from './env.schema';

/** Parses `15m`, `7d`, `12h`, `30s` or plain seconds into seconds. */
export function ttlToSeconds(ttl: string): number {
  const match = /^(\d+)([smhd]?)$/.exec(ttl.trim());
  if (!match) {
    throw new Error(`Invalid TTL "${ttl}"`);
  }
  const value = Number(match[1]);
  switch (match[2]) {
    case 'm':
      return value * 60;
    case 'h':
      return value * 3_600;
    case 'd':
      return value * 86_400;
    case 's':
    default:
      return value;
  }
}

/**
 * Typed accessor over `ConfigService` so modules never sprinkle string keys around.
 * Every getter reads validated values (see `env.schema.ts`).
 */
@Injectable()
export class AppConfig {
  constructor(private readonly config: ConfigService<Env, true>) {}

  get<K extends keyof Env>(key: K): Env[K] {
    return this.config.get(key, { infer: true });
  }

  get nodeEnv(): Env['NODE_ENV'] {
    return this.get('NODE_ENV');
  }

  get isProduction(): boolean {
    return this.nodeEnv === 'production';
  }

  get isTest(): boolean {
    return this.nodeEnv === 'test';
  }

  get appName(): string {
    return this.get('APP_NAME');
  }

  get port(): number {
    return this.get('API_PORT');
  }

  get globalPrefix(): string {
    return this.get('API_GLOBAL_PREFIX').replace(/^\/+|\/+$/g, '');
  }

  get corsOrigins(): string[] {
    return this.get('CORS_ORIGINS')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);
  }

  get webUrl(): string {
    return this.get('WEB_URL');
  }

  get databaseUrl(): string {
    return this.get('DATABASE_URL');
  }

  get redisUrl(): string {
    return this.get('REDIS_URL');
  }

  get jwt() {
    return {
      accessSecret: this.get('JWT_ACCESS_SECRET'),
      refreshSecret: this.get('JWT_REFRESH_SECRET'),
      accessTtl: this.get('JWT_ACCESS_TTL'),
      refreshTtl: this.get('JWT_REFRESH_TTL'),
      accessTtlSeconds: ttlToSeconds(this.get('JWT_ACCESS_TTL')),
      refreshTtlSeconds: ttlToSeconds(this.get('JWT_REFRESH_TTL')),
    };
  }

  get cookies() {
    const domain = this.get('COOKIE_DOMAIN');
    return {
      // `localhost` must be omitted or browsers reject the cookie.
      domain: domain && domain !== 'localhost' ? domain : undefined,
      secure: this.get('COOKIE_SECURE'),
    };
  }

  get encryptionKey(): string {
    return this.get('ENCRYPTION_KEY');
  }

  get throttle() {
    return {
      ttlMs: this.get('THROTTLE_TTL') * 1_000,
      limit: this.get('THROTTLE_LIMIT'),
    };
  }
}
