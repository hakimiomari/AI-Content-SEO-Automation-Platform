import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { COOKIE_NAMES } from '@acsp/shared';
import { AppModule } from './app.module';
import { AppConfig } from './config/configuration';

const SWAGGER_PATH = 'api/docs';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  const logger = new Logger('Bootstrap');
  const config = app.get(AppConfig);

  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  // CSP is disabled because this process only serves JSON + the Swagger UI (which needs inline scripts).
  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
  app.use(cookieParser());

  app.enableCors({
    origin: config.corsOrigins,
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-request-id'],
    exposedHeaders: ['x-request-id'],
    maxAge: 600,
  });

  app.setGlobalPrefix(config.globalPrefix);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle(config.appName)
    .setDescription('REST API for the AI Content & SEO Automation Platform.')
    .setVersion('1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
    .addCookieAuth(COOKIE_NAMES.ACCESS)
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup(SWAGGER_PATH, app, document, {
    jsonDocumentUrl: `${SWAGGER_PATH}-json`,
    swaggerOptions: { persistAuthorization: true },
  });

  app.enableShutdownHooks();

  await app.listen(config.port);

  const base = await app.getUrl();
  logger.log(`API      ${base}/${config.globalPrefix}`);
  logger.log(`Swagger  ${base}/${SWAGGER_PATH}`);
  logger.log(`Health   ${base}/${config.globalPrefix}/health`);
  logger.log(`Env      ${config.nodeEnv}`);
}

bootstrap().catch((err: unknown) => {
  console.error('Fatal error during bootstrap', err);
  process.exit(1);
});
