import { Injectable, Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { getQueueToken } from '@nestjs/bullmq';
import { Job, JobsOptions, Queue } from 'bullmq';
import { DEFAULT_JOB_OPTIONS, JobPayloadMap, QUEUES, QueueName } from '@acsp/shared';

export interface QueueStats {
  name: QueueName;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: boolean;
}

@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);
  private readonly cache = new Map<QueueName, Queue>();

  constructor(private readonly moduleRef: ModuleRef) {}

  /** Resolves the BullMQ queue instance registered by `QueueModule`. */
  getQueue(name: QueueName): Queue {
    const cached = this.cache.get(name);
    if (cached) return cached;
    const queue = this.moduleRef.get<Queue>(getQueueToken(name), { strict: false });
    this.cache.set(name, queue);
    return queue;
  }

  /**
   * Type-safe enqueue: the payload must match the queue's contract from `@acsp/shared`.
   * `DEFAULT_JOB_OPTIONS` (3 attempts, exponential backoff) apply unless overridden.
   */
  async enqueue<Q extends QueueName>(
    queue: Q,
    name: string,
    payload: JobPayloadMap[Q],
    opts: JobsOptions = {},
  ): Promise<Job<JobPayloadMap[Q]>> {
    const job = await this.getQueue(queue).add(name, payload, {
      ...DEFAULT_JOB_OPTIONS,
      ...opts,
    });
    this.logger.debug(`Enqueued ${queue}/${name} (job ${job.id}) for company ${payload.companyId}`);
    return job as Job<JobPayloadMap[Q]>;
  }

  async getStats(queue: QueueName): Promise<QueueStats> {
    const q = this.getQueue(queue);
    const [counts, paused] = await Promise.all([
      q.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed'),
      q.isPaused(),
    ]);
    return {
      name: queue,
      waiting: counts.waiting ?? 0,
      active: counts.active ?? 0,
      completed: counts.completed ?? 0,
      failed: counts.failed ?? 0,
      delayed: counts.delayed ?? 0,
      paused,
    };
  }

  async getAllStats(): Promise<QueueStats[]> {
    return Promise.all(Object.values(QUEUES).map((name) => this.getStats(name)));
  }
}
