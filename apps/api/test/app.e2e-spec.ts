import { INestApplication, ValidationPipe } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { QUEUES } from '@acsp/shared';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { REDIS_CLIENT } from '../src/redis/redis.constants';

const PREFIX = '/api/v1';

describe('App (e2e) — health & guards with mocked infrastructure', () => {
  let app: INestApplication;

  const prismaMock = {
    $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    $connect: jest.fn().mockResolvedValue(undefined),
    $disconnect: jest.fn().mockResolvedValue(undefined),
    user: { findUnique: jest.fn().mockResolvedValue(null) },
  };

  const redisMock = {
    status: 'ready',
    ping: jest.fn().mockResolvedValue('PONG'),
    connect: jest.fn().mockResolvedValue(undefined),
    quit: jest.fn().mockResolvedValue('OK'),
    disconnect: jest.fn(),
    on: jest.fn(),
  };

  const queueMock = {
    add: jest.fn(),
    getJobCounts: jest.fn().mockResolvedValue({}),
    isPaused: jest.fn().mockResolvedValue(false),
    close: jest.fn().mockResolvedValue(undefined),
  };

  beforeAll(async () => {
    const builder = Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .overrideProvider(REDIS_CLIENT)
      .useValue(redisMock);
    for (const name of Object.values(QUEUES)) {
      builder.overrideProvider(getQueueToken(name)).useValue(queueMock);
    }
    const moduleRef = await builder.compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    redisMock.ping.mockResolvedValue('PONG');
    prismaMock.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
  });

  it('GET /health returns 200 with both checks up', async () => {
    const res = await request(app.getHttpServer()).get(`${PREFIX}/health`).expect(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.checks.database.status).toBe('up');
    expect(res.body.checks.redis.status).toBe('up');
    expect(typeof res.body.uptime).toBe('number');
    expect(res.headers['x-request-id']).toBeDefined();
  });

  it('GET /health returns 503 when Redis is down', async () => {
    redisMock.ping.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const res = await request(app.getHttpServer()).get(`${PREFIX}/health`).expect(503);
    expect(res.body.status).toBe('degraded');
    expect(res.body.checks.redis.status).toBe('down');
  });

  it('GET /health returns 503 when the database is down', async () => {
    prismaMock.$queryRaw.mockRejectedValueOnce(new Error('connection refused'));
    const res = await request(app.getHttpServer()).get(`${PREFIX}/health`).expect(503);
    expect(res.body.checks.database.status).toBe('down');
  });

  it('GET /health/live returns 200', async () => {
    const res = await request(app.getHttpServer()).get(`${PREFIX}/health/live`).expect(200);
    expect(res.body.status).toBe('ok');
  });

  it('echoes a client-supplied x-request-id', async () => {
    const res = await request(app.getHttpServer())
      .get(`${PREFIX}/health/live`)
      .set('x-request-id', 'test-correlation-id')
      .expect(200);
    expect(res.headers['x-request-id']).toBe('test-correlation-id');
  });

  it('GET /auth/me without a token returns 401 in the standard error shape', async () => {
    const res = await request(app.getHttpServer()).get(`${PREFIX}/auth/me`).expect(401);
    expect(res.body).toMatchObject({
      statusCode: 401,
      error: expect.any(String),
      path: `${PREFIX}/auth/me`,
    });
    expect(res.body.timestamp).toBeDefined();
    expect(res.body.requestId).toBeDefined();
  });

  it('POST /auth/login with an invalid body returns 400 from the ValidationPipe', async () => {
    const res = await request(app.getHttpServer())
      .post(`${PREFIX}/auth/login`)
      .send({ email: 'not-an-email', password: '', extra: true })
      .expect(400);
    expect(res.body.statusCode).toBe(400);
    expect(Array.isArray(res.body.message)).toBe(true);
  });

  it('GET /admin/stats without a token returns 401 (guards run before role checks)', async () => {
    await request(app.getHttpServer()).get(`${PREFIX}/admin/stats`).expect(401);
  });
});
