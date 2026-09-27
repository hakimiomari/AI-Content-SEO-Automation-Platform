import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@acsp/database';
import { AppConfig } from '../config/configuration';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(private readonly appConfig: AppConfig) {
    super({
      datasources: { db: { url: appConfig.databaseUrl } },
      log: appConfig.isProduction ? ['error'] : ['warn', 'error'],
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Connected to PostgreSQL');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /**
   * Truncates every tenant table. Only for integration tests — refuses to run in production.
   * Order matters only for tables without cascading FKs; we use TRUNCATE ... CASCADE.
   */
  async cleanDatabase(): Promise<void> {
    if (this.appConfig.isProduction) {
      throw new Error('cleanDatabase() is disabled in production');
    }
    const tables = await this.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT LIKE '_prisma%'
    `;
    if (tables.length === 0) return;
    const names = tables.map((t) => `"public"."${t.tablename}"`).join(', ');
    await this.$executeRawUnsafe(`TRUNCATE TABLE ${names} RESTART IDENTITY CASCADE;`);
  }
}
