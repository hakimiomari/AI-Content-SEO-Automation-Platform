import { AIFeature, ContentStatus, NotificationType } from '@acsp/database';
import { QUEUES } from '@acsp/shared';
import { z } from 'zod';
import { EDITORIAL_RULES } from '../agents/base-agent';
import { ai, chooseModel } from '../lib/ai';
import { EntityNotFoundError } from '../lib/errors';
import { notify } from '../lib/notifications';
import { prisma } from '../lib/prisma';
import { assertWithinLimits, getSubscription } from '../lib/usage-guard';
import { defineProcessor } from './define-processor';
import { reportGenerationJobSchema } from './schemas';

export interface PeriodMetrics {
  from: string;
  to: string;
  clicks: number;
  impressions: number;
  ctr: number;
  avgPosition: number;
  rows: number;
}

export interface ReportData {
  project: { id: string; name: string; topic: string | null };
  website: { domain: string; url: string } | null;
  period: PeriodMetrics;
  previousPeriod: PeriodMetrics;
  topQueries: { query: string; clicks: number; impressions: number }[];
  topPages: { page: string; clicks: number; impressions: number }[];
  content: {
    byStatus: Record<string, number>;
    publishedInPeriod: number;
    createdInPeriod: number;
    totalWords: number;
    avgSeoScore: number | null;
    recentlyPublished: {
      title: string;
      publishedUrl: string | null;
      publishedAt: Date | null;
      seoScore: number | null;
    }[];
  };
  keywords: { total: number; byStatus: Record<string, number> };
  socialPosts: number;
}

function pct(numerator: number, denominator: number): number {
  return denominator ? Math.round((numerator / denominator) * 10_000) / 100 : 0;
}

async function periodMetrics(
  websiteId: string | null,
  from: Date,
  to: Date,
): Promise<PeriodMetrics> {
  const base = { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
  if (!websiteId) return { ...base, clicks: 0, impressions: 0, ctr: 0, avgPosition: 0, rows: 0 };
  const agg = await prisma.analyticsSnapshot.aggregate({
    where: { websiteId, date: { gte: from, lte: to } },
    _sum: { clicks: true, impressions: true },
    _avg: { position: true },
    _count: { _all: true },
  });
  const clicks = agg._sum.clicks ?? 0;
  const impressions = agg._sum.impressions ?? 0;
  return {
    ...base,
    clicks,
    impressions,
    ctr: pct(clicks, impressions),
    avgPosition: Math.round((agg._avg.position ?? 0) * 10) / 10,
    rows: agg._count._all,
  };
}

export async function collectReportData(
  projectId: string,
  companyId: string,
  from: Date,
  to: Date,
): Promise<ReportData> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, companyId },
    include: { website: { select: { id: true, domain: true, url: true } } },
  });
  if (!project) throw new EntityNotFoundError('Project', projectId);
  const websiteId = project.website?.id ?? null;

  const spanMs = Math.max(86_400_000, to.getTime() - from.getTime());
  const prevTo = new Date(from.getTime() - 1);
  const prevFrom = new Date(prevTo.getTime() - spanMs);

  const [period, previousPeriod] = await Promise.all([
    periodMetrics(websiteId, from, to),
    periodMetrics(websiteId, prevFrom, prevTo),
  ]);

  const topQueries = websiteId
    ? await prisma.analyticsSnapshot.groupBy({
        by: ['query'],
        where: { websiteId, date: { gte: from, lte: to }, query: { not: '' } },
        _sum: { clicks: true, impressions: true },
        orderBy: { _sum: { clicks: 'desc' } },
        take: 10,
      })
    : [];
  const topPages = websiteId
    ? await prisma.analyticsSnapshot.groupBy({
        by: ['page'],
        where: { websiteId, date: { gte: from, lte: to }, page: { not: '' } },
        _sum: { clicks: true, impressions: true },
        orderBy: { _sum: { clicks: 'desc' } },
        take: 10,
      })
    : [];

  const [
    statusGroups,
    publishedInPeriod,
    createdInPeriod,
    wordsAgg,
    recentlyPublished,
    keywordGroups,
    socialPosts,
  ] = await Promise.all([
    prisma.content.groupBy({ by: ['status'], where: { projectId }, _count: { _all: true } }),
    prisma.content.count({ where: { projectId, publishedAt: { gte: from, lte: to } } }),
    prisma.content.count({ where: { projectId, createdAt: { gte: from, lte: to } } }),
    prisma.content.aggregate({
      where: { projectId, status: { not: ContentStatus.ARCHIVED } },
      _sum: { wordCount: true },
      _avg: { seoScore: true },
    }),
    prisma.content.findMany({
      where: { projectId, publishedAt: { gte: from, lte: to } },
      select: { title: true, publishedUrl: true, publishedAt: true, seoScore: true },
      orderBy: { publishedAt: 'desc' },
      take: 10,
    }),
    prisma.keyword.groupBy({ by: ['status'], where: { projectId }, _count: { _all: true } }),
    prisma.socialPost.count({ where: { projectId, createdAt: { gte: from, lte: to } } }),
  ]);

  return {
    project: { id: project.id, name: project.name, topic: project.topic },
    website: project.website ? { domain: project.website.domain, url: project.website.url } : null,
    period,
    previousPeriod,
    topQueries: topQueries.map((q) => ({
      query: q.query,
      clicks: q._sum?.clicks ?? 0,
      impressions: q._sum?.impressions ?? 0,
    })),
    topPages: topPages.map((p) => ({
      page: p.page,
      clicks: p._sum?.clicks ?? 0,
      impressions: p._sum?.impressions ?? 0,
    })),
    content: {
      byStatus: Object.fromEntries(statusGroups.map((g) => [g.status, g._count._all])),
      publishedInPeriod,
      createdInPeriod,
      totalWords: wordsAgg._sum.wordCount ?? 0,
      avgSeoScore: wordsAgg._avg.seoScore === null ? null : Math.round(wordsAgg._avg.seoScore),
      recentlyPublished,
    },
    keywords: {
      total: keywordGroups.reduce((n, g) => n + g._count._all, 0),
      byStatus: Object.fromEntries(keywordGroups.map((g) => [g.status, g._count._all])),
    },
    socialPosts,
  };
}

const summarySchema = z.object({
  headline: z.string().max(200),
  summary: z.string().min(50),
  highlights: z.array(z.string().max(300)).catch([]),
  risks: z.array(z.string().max(300)).catch([]),
  recommendations: z.array(z.string().max(300)).catch([]),
});
export type ReportSummary = z.infer<typeof summarySchema>;

/**
 * Hook for Phase 7: render the report (PDF/HTML), upload to MinIO, create a FileObject row and
 * return its public URL. Until then the report lives in the Notification message.
 */
async function persistReport(_data: ReportData, _summary: ReportSummary): Promise<string | null> {
  // TODO(phase-7): upload to MinIO bucket `MINIO_BUCKET`, insert FileObject, return url.
  return null;
}

/**
 * report-generation: aggregates analytics snapshots + content pipeline stats for a project and
 * date range, asks the model for an executive summary, and delivers it as a Notification.
 */
export const reportGenerationProcessor = defineProcessor(
  QUEUES.REPORT_GENERATION,
  reportGenerationJobSchema,
  async ({ payload, jobId, log }) => {
    const from = new Date(payload.from);
    const to = new Date(payload.to);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
      throw new EntityNotFoundError('Valid date range', `${payload.from}..${payload.to}`);
    }
    to.setUTCHours(23, 59, 59, 999);

    const subscription = await getSubscription(payload.companyId);
    await assertWithinLimits(payload.companyId, { aiCredits: 1 });

    const data = await collectReportData(payload.projectId, payload.companyId, from, to);
    log.info(
      { clicks: data.period.clicks, published: data.content.publishedInPeriod },
      'Report data collected',
    );

    const completion = await ai.complete<unknown>({
      feature: AIFeature.REPORT,
      companyId: payload.companyId,
      userId: payload.userId,
      jobId,
      model: chooseModel(subscription.plan),
      json: true,
      temperature: 0.3,
      maxTokens: 1_800,
      system: `You write executive summaries of SEO & content performance for busy marketing leads. You use ONLY the numbers provided — never estimate, extrapolate or invent figures. When data is missing (e.g. no Search Console rows yet), say so plainly and focus on the pipeline metrics that do exist.

${EDITORIAL_RULES}

Return ONE JSON object only:
{
  "headline": "<one sentence, the single most important takeaway>",
  "summary": "<200-350 words in plain prose (markdown allowed: short paragraphs, no headings). Compare the period with the previous period where numbers exist. Mention top queries/pages and content shipped.>",
  "highlights": ["<3-5 wins, each with the supporting number>"],
  "risks": ["<0-4 concerns or gaps>"],
  "recommendations": ["<3-5 specific next actions for the next period>"]
}`,
      user: JSON.stringify(data, null, 2),
      metadata: { projectId: data.project.id, from: payload.from, to: payload.to },
    });

    const parsed = summarySchema.safeParse(completion.parsed);
    if (!parsed.success) {
      throw new Error(
        `Report summary returned an unexpected shape: ${parsed.error.issues[0]?.message}`,
      );
    }
    const summary = parsed.data;
    const fileUrl = await persistReport(data, summary);

    const link =
      fileUrl ?? `/projects/${data.project.id}/reports?from=${payload.from}&to=${payload.to}`;
    const message = [
      summary.headline,
      '',
      summary.summary,
      summary.highlights.length
        ? `\nHighlights:\n${summary.highlights.map((h) => `• ${h}`).join('\n')}`
        : '',
      summary.risks.length ? `\nRisks:\n${summary.risks.map((r) => `• ${r}`).join('\n')}` : '',
      summary.recommendations.length
        ? `\nNext steps:\n${summary.recommendations.map((r) => `• ${r}`).join('\n')}`
        : '',
    ]
      .join('\n')
      .trim();

    await notify({
      companyId: payload.companyId,
      userId: payload.userId,
      type: NotificationType.INFO,
      title: `Report ready: ${data.project.name} (${payload.from} → ${payload.to})`,
      message,
      link,
    });

    return { projectId: data.project.id, headline: summary.headline, period: data.period, fileUrl };
  },
);
