import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@acsp/database';
import { PLAN_LIMITS } from '@acsp/shared';
import type { Paginated, Plan, SubscriptionStatus } from '@acsp/shared';
import type { RequestUser } from '../../common/types/request-user';
import { paginate, toOrderBy, toPageArgs } from '../../common/utils/pagination';
import type { RequestMeta } from '../../common/utils/request';
import { resolveCompanyId } from '../../common/utils/tenant';
import { rethrowPrismaError } from '../../prisma/prisma-errors';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CompaniesQueryDto } from './dto/companies-query.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';

export const companyDetailSelect = {
  id: true,
  name: true,
  slug: true,
  logoUrl: true,
  industry: true,
  description: true,
  timezone: true,
  locale: true,
  createdAt: true,
  updatedAt: true,
  subscription: true,
  _count: { select: { users: true, websites: true, projects: true, integrations: true } },
} satisfies Prisma.CompanySelect;

export type CompanyDetail = Prisma.CompanyGetPayload<{ select: typeof companyDetailSelect }>;

export interface UsageMeter {
  used: number;
  limit: number;
  remaining: number;
  percent: number;
}

export interface CompanyUsage {
  companyId: string;
  plan: Plan;
  status: SubscriptionStatus;
  period: { start: string; end: string | null };
  usage: {
    words: UsageMeter;
    aiCredits: UsageMeter;
    users: UsageMeter;
    websites: UsageMeter;
    projects: UsageMeter;
    integrations: UsageMeter;
  };
  ai: { requests: number; totalTokens: number; estimatedCostUsd: number };
  limits: (typeof PLAN_LIMITS)[Plan];
}

const COMPANY_SORT_FIELDS = ['createdAt', 'name', 'slug', 'updatedAt'] as const;

function meter(used: number, limit: number): UsageMeter {
  return {
    used,
    limit,
    remaining: Math.max(0, limit - used),
    percent: limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0,
  };
}

@Injectable()
export class CompaniesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ─────────────────────────── tenant-facing ───────────────────────────

  async getMine(actor: RequestUser, requestedCompanyId?: string): Promise<CompanyDetail> {
    const companyId = resolveCompanyId(actor, requestedCompanyId);
    return this.findById(companyId);
  }

  async updateMine(
    actor: RequestUser,
    dto: UpdateCompanyDto,
    meta: RequestMeta,
    requestedCompanyId?: string,
  ): Promise<CompanyDetail> {
    const companyId = resolveCompanyId(actor, requestedCompanyId);
    const before = await this.findById(companyId);
    try {
      const after = await this.prisma.company.update({
        where: { id: companyId },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.slug !== undefined ? { slug: dto.slug } : {}),
          ...(dto.industry !== undefined ? { industry: dto.industry } : {}),
          ...(dto.description !== undefined ? { description: dto.description } : {}),
          ...(dto.timezone !== undefined ? { timezone: dto.timezone } : {}),
          ...(dto.locale !== undefined ? { locale: dto.locale } : {}),
          ...(dto.logoUrl !== undefined ? { logoUrl: dto.logoUrl } : {}),
        },
        select: companyDetailSelect,
      });
      await this.audit.log({
        action: 'UPDATE',
        entity: 'Company',
        entityId: companyId,
        before: this.snapshot(before),
        after: this.snapshot(after),
        userId: actor.id,
        companyId,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      return after;
    } catch (err: unknown) {
      rethrowPrismaError(err, 'Company');
    }
  }

  async getUsage(actor: RequestUser, requestedCompanyId?: string): Promise<CompanyUsage> {
    const companyId = resolveCompanyId(actor, requestedCompanyId);
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: {
        id: true,
        subscription: true,
        _count: {
          select: {
            users: { where: { isActive: true } },
            websites: true,
            projects: { where: { status: { not: 'ARCHIVED' } } },
            integrations: true,
          },
        },
      },
    });
    if (!company) throw new NotFoundException('Company not found');

    const subscription = company.subscription;
    const plan: Plan = subscription?.plan ?? 'FREE';
    const status: SubscriptionStatus = subscription?.status ?? 'ACTIVE';
    const periodStart = subscription?.currentPeriodStart ?? new Date(0);
    const limits = PLAN_LIMITS[plan];

    const ai = await this.prisma.aIUsage.aggregate({
      where: { companyId, createdAt: { gte: periodStart } },
      _count: { _all: true },
      _sum: { totalTokens: true, estimatedCostUsd: true },
    });

    return {
      companyId,
      plan,
      status,
      period: {
        start: periodStart.toISOString(),
        end: subscription?.currentPeriodEnd?.toISOString() ?? null,
      },
      usage: {
        words: meter(subscription?.wordsUsed ?? 0, limits.wordsPerMonth),
        aiCredits: meter(subscription?.aiCreditsUsed ?? 0, limits.aiCreditsPerMonth),
        users: meter(company._count.users, limits.users),
        websites: meter(company._count.websites, limits.websites),
        projects: meter(company._count.projects, limits.projects),
        integrations: meter(company._count.integrations, limits.integrations),
      },
      ai: {
        requests: ai._count._all,
        totalTokens: ai._sum.totalTokens ?? 0,
        estimatedCostUsd: Number(ai._sum.estimatedCostUsd ?? 0),
      },
      limits,
    };
  }

  // ─────────────────────────── platform admin ───────────────────────────

  async list(query: CompaniesQueryDto): Promise<Paginated<CompanyDetail>> {
    const where: Prisma.CompanyWhereInput = {
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { slug: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(query.plan || query.status
        ? {
            subscription: {
              ...(query.plan ? { plan: query.plan } : {}),
              ...(query.status ? { status: query.status } : {}),
            },
          }
        : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.company.findMany({
        where,
        select: companyDetailSelect,
        ...toPageArgs(query),
        orderBy: toOrderBy(query, COMPANY_SORT_FIELDS, 'createdAt'),
      }),
      this.prisma.company.count({ where }),
    ]);
    return paginate(data, total, query);
  }

  async findById(id: string): Promise<CompanyDetail> {
    const company = await this.prisma.company.findUnique({
      where: { id },
      select: companyDetailSelect,
    });
    if (!company) throw new NotFoundException('Company not found');
    return company;
  }

  async updateSubscription(
    actor: RequestUser,
    companyId: string,
    dto: UpdateSubscriptionDto,
    meta: RequestMeta,
  ): Promise<CompanyDetail> {
    const before = await this.findById(companyId);
    const now = new Date();
    const changes: Prisma.SubscriptionUpdateInput = {
      ...(dto.plan !== undefined ? { plan: dto.plan } : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
      ...(dto.currentPeriodEnd !== undefined
        ? { currentPeriodEnd: dto.currentPeriodEnd ? new Date(dto.currentPeriodEnd) : null }
        : {}),
      ...(dto.cancelAtPeriodEnd !== undefined ? { cancelAtPeriodEnd: dto.cancelAtPeriodEnd } : {}),
      ...(dto.resetUsage ? { wordsUsed: 0, aiCreditsUsed: 0, currentPeriodStart: now } : {}),
    };

    await this.prisma.subscription.upsert({
      where: { companyId },
      create: {
        companyId,
        plan: dto.plan ?? 'FREE',
        status: dto.status ?? 'ACTIVE',
        currentPeriodEnd: dto.currentPeriodEnd ? new Date(dto.currentPeriodEnd) : null,
        cancelAtPeriodEnd: dto.cancelAtPeriodEnd ?? false,
      },
      update: changes,
    });

    const after = await this.findById(companyId);
    await this.audit.log({
      action: 'BILLING',
      entity: 'Subscription',
      entityId: after.subscription?.id ?? companyId,
      before: before.subscription,
      after: after.subscription,
      userId: actor.id,
      companyId,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return after;
  }

  private snapshot(company: CompanyDetail) {
    const { subscription: _subscription, _count, ...rest } = company;
    return rest;
  }
}
