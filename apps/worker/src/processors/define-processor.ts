import type { Job } from 'bullmq';
import type { QueueName } from '@acsp/shared';
import type { ZodType, ZodTypeDef } from 'zod';
import { InvalidJobPayloadError, errorMessage } from '../lib/errors';
import { logger as rootLogger, type Logger } from '../lib/logger';

export type ProcessorFn = (job: Job) => Promise<unknown>;

export interface ProcessorContext<T> {
  payload: T;
  job: Job;
  jobId: string;
  log: Logger;
  /** True when this is the final retry — used to decide whether to notify users of a failure. */
  isLastAttempt: boolean;
}

/**
 * Wraps a queue handler with payload validation, structured start/end logging and error
 * propagation. Errors are never swallowed: they are logged and re-thrown so BullMQ applies the
 * retry policy from `DEFAULT_JOB_OPTIONS` (or fails fast for UnrecoverableError subclasses).
 */
export function defineProcessor<T>(
  queue: QueueName,
  schema: ZodType<T, ZodTypeDef, unknown>,
  handler: (ctx: ProcessorContext<T>) => Promise<unknown>,
): ProcessorFn {
  return async (job: Job) => {
    const jobId = job.id ?? 'unknown';
    const attempts = job.opts.attempts ?? 1;
    const isLastAttempt = job.attemptsMade + 1 >= attempts;
    const log = rootLogger.child({ queue, jobId, attempt: job.attemptsMade + 1, of: attempts });

    const parsed = schema.safeParse(job.data);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
      log.error({ issues }, 'Invalid job payload');
      throw new InvalidJobPayloadError(`Invalid payload for ${queue}: ${issues}`);
    }

    const startedAt = Date.now();
    log.info({ companyId: (parsed.data as { companyId?: string }).companyId }, 'Job started');
    try {
      const result = await handler({ payload: parsed.data, job, jobId, log, isLastAttempt });
      log.info({ durationMs: Date.now() - startedAt }, 'Job completed');
      return result;
    } catch (err) {
      log.error(
        { err, durationMs: Date.now() - startedAt, isLastAttempt, message: errorMessage(err) },
        'Job failed',
      );
      throw err;
    }
  };
}
