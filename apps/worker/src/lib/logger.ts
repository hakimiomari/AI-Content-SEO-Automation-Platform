import pino, { type Logger } from 'pino';
import { config } from '../config';

export const logger: Logger = pino({
  name: 'acsp-worker',
  level: config.LOG_LEVEL,
  base: { service: 'worker', env: config.NODE_ENV },
  redact: {
    paths: ['*.credentials', '*.password', '*.applicationPassword', '*.apiKey', 'credentials'],
    censor: '[redacted]',
  },
  ...(config.isDev
    ? {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss.l',
            ignore: 'pid,hostname,service,env',
          },
        },
      }
    : {}),
});

export type { Logger };

export function childLogger(bindings: Record<string, unknown>): Logger {
  return logger.child(bindings);
}
