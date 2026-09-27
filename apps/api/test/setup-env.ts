/**
 * Loaded by jest before the AppModule is imported so `ConfigModule.forRoot({ validate })`
 * passes without a real .env. Values are dummies; DB/Redis are mocked in the tests.
 */
process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://platform:platform@localhost:5432/platform_test';
process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379/1';
process.env.JWT_ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET ?? 'test-access-secret-'.padEnd(48, 'x');
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET ?? 'test-refresh-secret-'.padEnd(48, 'y');
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY ?? '0'.repeat(64);
process.env.COOKIE_SECURE = 'false';
