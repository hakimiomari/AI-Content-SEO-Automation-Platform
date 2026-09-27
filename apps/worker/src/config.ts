import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

// Precedence: real process env > apps/worker/.env (local overrides) > repo-root .env.
// dotenv never overrides variables that are already set, so loading the local file first
// lets it take priority over the shared root file.
dotenv.config({ path: path.resolve(__dirname, '../.env'), quiet: true });
dotenv.config({ path: path.resolve(__dirname, '../../../.env'), quiet: true });

const PLACEHOLDER_KEYS = new Set(['', 'sk-your-key', 'changeme', 'change-me']);

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),
  OPENAI_API_KEY: z
    .string()
    .optional()
    .transform((v) => (v && !PLACEHOLDER_KEYS.has(v.trim()) ? v.trim() : undefined)),
  OPENAI_MODEL: z.string().min(1).default('gpt-4o-mini'),
  OPENAI_MODEL_PREMIUM: z.string().min(1).default('gpt-4o'),
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(64).default(3),
  WORKER_HEALTH_PORT: z.coerce.number().int().min(0).max(65535).default(4001),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, 'ENCRYPTION_KEY must be 32 bytes as hex (openssl rand -hex 32)')
    .optional(),
  WEB_URL: z.string().default('http://localhost:3000'),
  APP_NAME: z.string().default('AI Content & SEO Automation Platform'),
});

export type WorkerConfig = z.infer<typeof envSchema> & {
  isDev: boolean;
  isProd: boolean;
  /** Non-fatal configuration problems, logged once at startup. */
  warnings: string[];
};

function loadConfig(): WorkerConfig {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid worker environment:\n${issues}`);
  }
  const env = parsed.data;
  const warnings: string[] = [];
  if (!env.OPENAI_API_KEY) {
    warnings.push(
      'OPENAI_API_KEY is not set (or is the placeholder). AI-powered jobs will fail with AIConfigurationError until it is configured.',
    );
  }
  if (!env.ENCRYPTION_KEY || /^0+$/.test(env.ENCRYPTION_KEY)) {
    warnings.push(
      'ENCRYPTION_KEY is missing or the all-zero placeholder. Publishing jobs cannot decrypt integration credentials.',
    );
  }
  return {
    ...env,
    isDev: env.NODE_ENV === 'development',
    isProd: env.NODE_ENV === 'production',
    warnings,
  };
}

export const config = loadConfig();
