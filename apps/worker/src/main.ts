import http from 'node:http';
import { QueueEvents, Worker } from 'bullmq';
import { QUEUES, type QueueName } from '@acsp/shared';
import { config } from './config';
import { ai } from './lib/ai';
import { logger } from './lib/logger';
import { closePrisma, prisma } from './lib/prisma';
import { closeRedis, redis } from './lib/redis';
import { PROCESSORS } from './processors';

const QUEUE_NAMES = Object.values(QUEUES) as QueueName[];

/** Heavier queues get a slice of the configured concurrency; light ones can run in parallel. */
function concurrencyFor(queue: QueueName): number {
  switch (queue) {
    case QUEUES.CONTENT_GENERATION:
      return Math.max(1, Math.ceil(config.WORKER_CONCURRENCY / 2));
    case QUEUES.SEO_ANALYSIS:
    case QUEUES.PUBLISHING:
      return config.WORKER_CONCURRENCY * 2;
    default:
      return config.WORKER_CONCURRENCY;
  }
}

async function main(): Promise<void> {
  for (const warning of config.warnings) logger.warn(warning);
  logger.info(
    {
      env: config.NODE_ENV,
      concurrency: config.WORKER_CONCURRENCY,
      model: config.OPENAI_MODEL,
      premiumModel: config.OPENAI_MODEL_PREMIUM,
      aiConfigured: ai.isConfigured,
    },
    'Starting worker',
  );

  await prisma.$connect();

  const workers: Worker[] = [];
  const events: QueueEvents[] = [];

  for (const queue of QUEUE_NAMES) {
    const worker = new Worker(queue, PROCESSORS[queue], {
      connection: redis,
      concurrency: concurrencyFor(queue),
      lockDuration: 5 * 60_000, // AI jobs can be slow; renewals happen automatically
      stalledInterval: 60_000,
      maxStalledCount: 2,
    });

    worker.on('completed', (job) => logger.debug({ queue, jobId: job.id }, 'Job completed'));
    worker.on('failed', (job, err) =>
      logger.error({ queue, jobId: job?.id, attemptsMade: job?.attemptsMade, err }, 'Job failed'),
    );
    worker.on('error', (err) => logger.error({ queue, err }, 'Worker error'));
    worker.on('stalled', (jobId) => logger.warn({ queue, jobId }, 'Job stalled'));

    const queueEvents = new QueueEvents(queue, { connection: redis });
    queueEvents.on('failed', ({ jobId, failedReason, prev }) =>
      logger.warn({ queue, jobId, failedReason, prev }, 'Queue event: failed'),
    );
    queueEvents.on('error', (err) => logger.error({ queue, err }, 'QueueEvents error'));

    workers.push(worker);
    events.push(queueEvents);
    logger.info({ queue, concurrency: concurrencyFor(queue) }, 'Worker registered');
  }

  const server = startHealthServer(workers);

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Shutting down worker');
    const timer = setTimeout(() => {
      logger.error('Graceful shutdown timed out; forcing exit');
      process.exit(1);
    }, 30_000);
    timer.unref();

    try {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await Promise.allSettled(workers.map((w) => w.close()));
      await Promise.allSettled(events.map((e) => e.close()));
      await closePrisma();
      await closeRedis();
      logger.info('Worker stopped cleanly');
      process.exit(0);
    } catch (err) {
      logger.error({ err }, 'Error during shutdown');
      process.exit(1);
    }
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('unhandledRejection', (reason) =>
    logger.error({ err: reason }, 'Unhandled promise rejection'),
  );
  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'Uncaught exception');
    void shutdown('uncaughtException');
  });
}

function startHealthServer(workers: Worker[]): http.Server {
  const server = http.createServer((req, res) => {
    if (req.url === '/health' || req.url === '/' || req.url === '/healthz') {
      const body = {
        status: redis.status === 'ready' ? 'ok' : 'degraded',
        redis: redis.status,
        queues: QUEUE_NAMES,
        workers: workers.map((w) => ({
          name: w.name,
          running: w.isRunning(),
          paused: w.isPaused(),
        })),
        aiConfigured: ai.isConfigured,
        uptimeSeconds: Math.round(process.uptime()),
      };
      res.writeHead(body.status === 'ok' ? 200 : 503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
      return;
    }
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'not_found' }));
  });

  if (config.WORKER_HEALTH_PORT > 0) {
    server.listen(config.WORKER_HEALTH_PORT, () =>
      logger.info({ port: config.WORKER_HEALTH_PORT }, 'Health endpoint listening'),
    );
    server.on('error', (err) => logger.error({ err }, 'Health server error'));
  }
  return server;
}

main().catch((err) => {
  logger.fatal({ err }, 'Worker failed to start');
  process.exit(1);
});
