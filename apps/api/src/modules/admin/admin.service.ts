import { Injectable, Logger } from '@nestjs/common';
import { Plans } from '@acsp/shared';
import type { AIFeature, Plan } from '@acsp/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { QueueService, QueueStats } from '../../queue/queue.service';

export interface AdminStats {
  generatedAt: string;
  companies: { total: number; byPlan: Record<Plan, number> };
  users: { total: number; active: number; newLast30Days: number };
  content: { total: number; published: number; createdLast30Days: number };
  ai: {
    last30Days: { requests: number; totalTokens: number; estimatedCostUsd: number };
    byFeature: Array<{
      feature: AIFeature;
      requests: number;
      totalTokens: number;
      estimatedCostUsd: number;
    }>;
  };
  queues: QueueStats[];
  queuesError?: string;
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1_000;

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queues: QueueService,
  ) {}

  async getStats(): Promise<AdminStats> {
    const since = new Date(Date.now() - THIRTY_DAYS_MS);

    const [
      companiesTotal,
      byPlanRows,
      usersTotal,
      usersActive,
      usersNew,
      contentTotal,
      contentPublished,
      contentNew,
      aiTotals,
      aiByFeature,
    ] = await Promise.all([
      this.prisma.company.count(),
      this.prisma.subscription.groupBy({
        by: ['plan'],
        _count: { _all: true },
        orderBy: { plan: 'asc' },
      }),
      this.prisma.user.count(),
      this.prisma.user.count({ where: { isActive: true } }),
      this.prisma.user.count({ where: { createdAt: { gte: since } } }),
      this.prisma.content.count(),
      this.prisma.content.count({ where: { status: 'PUBLISHED' } }),
      this.prisma.content.count({ where: { createdAt: { gte: since } } }),
      this.prisma.aIUsage.aggregate({
        where: { createdAt: { gte: since } },
        _count: { _all: true },
        _sum: { totalTokens: true, estimatedCostUsd: true },
      }),
      this.prisma.aIUsage.groupBy({
        by: ['feature'],
        where: { createdAt: { gte: since } },
        _count: { _all: true },
        _sum: { totalTokens: true, estimatedCostUsd: true },
        orderBy: { feature: 'asc' },
      }),
    ]);

    const byPlan = Object.fromEntries(Plans.map((plan) => [plan, 0])) as Record<Plan, number>;
    for (const row of byPlanRows) {
      byPlan[row.plan] = row._count._all;
    }

    let queues: QueueStats[] = [];
    let queuesError: string | undefined;
    try {
      queues = await this.queues.getAllStats();
    } catch (err: unknown) {
      queuesError = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Queue stats unavailable: ${queuesError}`);
    }

    return {
      generatedAt: new Date().toISOString(),
      companies: { total: companiesTotal, byPlan },
      users: { total: usersTotal, active: usersActive, newLast30Days: usersNew },
      content: { total: contentTotal, published: contentPublished, createdLast30Days: contentNew },
      ai: {
        last30Days: {
          requests: aiTotals._count._all,
          totalTokens: aiTotals._sum.totalTokens ?? 0,
          estimatedCostUsd: Number(aiTotals._sum.estimatedCostUsd ?? 0),
        },
        byFeature: aiByFeature.map((row) => ({
          feature: row.feature,
          requests: row._count._all,
          totalTokens: row._sum.totalTokens ?? 0,
          estimatedCostUsd: Number(row._sum.estimatedCostUsd ?? 0),
        })),
      },
      queues,
      ...(queuesError ? { queuesError } : {}),
    };
  }
}
