import {
  BriefStatus,
  ContentStatus,
  KeywordStatus,
  Prisma,
  type ContentBrief,
  type Keyword,
  type KeywordCluster,
  type Project,
  type Website,
} from '@acsp/database';
import type { ContentType, SearchIntent } from '@acsp/shared';
import { chooseModel } from '../lib/ai';
import { EntityNotFoundError } from '../lib/errors';
import { logger as rootLogger, type Logger } from '../lib/logger';
import { prisma, toJson } from '../lib/prisma';
import { excerptFromHtml, slugify } from '../lib/text';
import { assertWithinLimits, getSubscription, recordUsage } from '../lib/usage-guard';
import { QualityAgent } from './quality-agent';
import { SeoAgent } from './seo-agent';
import { WritingAgent, estimateWriterCalls } from './writing-agent';

export interface GenerateArticleInput {
  companyId: string;
  userId?: string;
  projectId: string;
  briefId: string;
  contentId?: string;
  jobId?: string;
  logger?: Logger;
}

export interface GenerateArticleResult {
  contentId: string;
  versionId: string;
  version: number;
  title: string;
  slug: string;
  wordCount: number;
  qualityScore: number;
  seoScore: number;
  revised: boolean;
  aiCalls: number;
  estimatedCostUsd: number;
}

type BriefWithRelations = ContentBrief & {
  keyword: Keyword | null;
  cluster: KeywordCluster | null;
  project: Project & { website: Website | null };
};

export interface OrchestratorDeps {
  seo: SeoAgent;
  writer: WritingAgent;
  quality: QualityAgent;
}

/** Quality threshold below which the Quality Agent performs its single revision pass. */
export const QUALITY_THRESHOLD = 75;

/**
 * Orchestrator — coordinates SEO → Writing → Quality for one brief and persists the result as a
 * Content row with a new ContentVersion. Idempotent with respect to `contentId`: re-running adds a
 * new version instead of duplicating content.
 */
export class Orchestrator {
  private readonly deps: OrchestratorDeps;

  constructor(deps?: Partial<OrchestratorDeps>) {
    this.deps = {
      seo: deps?.seo ?? new SeoAgent(),
      writer: deps?.writer ?? new WritingAgent(),
      quality: deps?.quality ?? new QualityAgent(),
    };
  }

  async generateArticle(input: GenerateArticleInput): Promise<GenerateArticleResult> {
    const log = (input.logger ?? rootLogger).child({
      module: 'orchestrator',
      briefId: input.briefId,
      jobId: input.jobId,
    });

    // 1. Load tenant-scoped inputs.
    const brief = (await prisma.contentBrief.findFirst({
      where: {
        id: input.briefId,
        projectId: input.projectId,
        project: { companyId: input.companyId },
      },
      include: { keyword: true, cluster: true, project: { include: { website: true } } },
    })) as BriefWithRelations | null;
    if (!brief) throw new EntityNotFoundError('ContentBrief', input.briefId);

    const existingContent = input.contentId
      ? await prisma.content.findFirst({
          where: {
            id: input.contentId,
            projectId: input.projectId,
            project: { companyId: input.companyId },
          },
        })
      : null;
    if (input.contentId && !existingContent)
      throw new EntityNotFoundError('Content', input.contentId);

    const website = brief.project.website;
    const keyword = brief.keyword?.term ?? brief.title;
    const language = website?.language ?? existingContent?.language ?? 'en';
    const targetWords = brief.targetWords;

    // 2. Plan limits + model choice.
    const subscription = await getSubscription(input.companyId);
    const estimatedCalls = 1 + estimateWriterCalls(targetWords) + 2;
    await assertWithinLimits(input.companyId, { words: targetWords, aiCredits: estimatedCalls });
    const model = chooseModel(subscription.plan);
    const ctx = {
      companyId: input.companyId,
      userId: input.userId,
      jobId: input.jobId,
      model,
      logger: log,
    };

    const internalPages = await this.internalPages(brief.projectId, existingContent?.id);

    // 3. SEO structure.
    const seo = await this.deps.seo.run(
      {
        keyword,
        secondaryKeywords: brief.secondaryKeywords,
        title: brief.title,
        contentType: brief.contentType as ContentType,
        intent: (brief.intent ?? brief.keyword?.intent ?? null) as SearchIntent | null,
        audience: brief.audience,
        tone: brief.tone,
        questions: brief.questions,
        targetWords,
        existingOutline: brief.outline,
        notes: brief.notes,
        businessProfile: website?.businessProfile,
        websiteDomain: website?.domain,
        language,
        internalPages,
      },
      ctx,
    );

    // 4. Draft.
    const draft = await this.deps.writer.run(
      {
        seo,
        keyword,
        secondaryKeywords: brief.secondaryKeywords,
        contentType: brief.contentType as ContentType,
        audience: brief.audience,
        tone: brief.tone,
        brandVoice: website?.brandVoice,
        businessProfile: website?.businessProfile,
        notes: brief.notes,
        targetWords,
        language,
        websiteDomain: website?.domain,
      },
      ctx,
    );

    // 5. Quality gate with one revision loop.
    const quality = await this.deps.quality.run(
      {
        html: draft.html,
        keyword,
        secondaryKeywords: brief.secondaryKeywords,
        title: seo.title,
        metaTitle: seo.metaTitle,
        metaDescription: seo.metaDescription,
        audience: brief.audience,
        tone: brief.tone,
        brandVoice: website?.brandVoice,
        targetWords,
        expectedHeadings: seo.outline.map((s) => s.h2),
        questions: [...brief.questions, ...seo.faqs.map((f) => f.question)],
        language,
        siteDomain: website?.domain,
        threshold: QUALITY_THRESHOLD,
      },
      ctx,
    );

    const finalHtml = quality.revised && quality.revisedHtml ? quality.revisedHtml : draft.html;
    const heuristics =
      quality.revised && quality.revisedHeuristics ? quality.revisedHeuristics : quality.heuristics;
    const wordCount = heuristics.wordCount;
    const aiCalls = seo.calls + draft.calls + quality.calls;
    const estimatedCostUsd =
      Math.round((draft.usage.estimatedCostUsd + quality.usage.estimatedCostUsd) * 1e6) / 1e6;

    // 6. Persist content + version atomically.
    const persisted = await prisma.$transaction(async (tx) => {
      const slug = existingContent?.slug ?? (await this.uniqueSlug(tx, brief.projectId, seo.slug));
      const baseData = {
        title: seo.title,
        contentType: brief.contentType,
        excerpt: excerptFromHtml(finalHtml, 300),
        metaTitle: seo.metaTitle,
        metaDescription: seo.metaDescription,
        language,
        briefId: brief.id,
        keywordId: brief.keywordId,
      };

      const content = existingContent
        ? await tx.content.update({ where: { id: existingContent.id }, data: baseData })
        : await tx.content.create({
            data: {
              ...baseData,
              slug,
              projectId: brief.projectId,
              authorId: input.userId ?? null,
              status: ContentStatus.GENERATING,
            },
          });

      const last = await tx.contentVersion.findFirst({
        where: { contentId: content.id },
        orderBy: { version: 'desc' },
        select: { version: true },
      });
      const version = (last?.version ?? 0) + 1;

      const contentVersion = await tx.contentVersion.create({
        data: {
          contentId: content.id,
          version,
          body: finalHtml,
          source: 'ai:generate',
          summary: quality.revised
            ? `AI draft (revised once; quality ${quality.finalScore}/100, SEO ${heuristics.score}/100)`
            : `AI draft (quality ${quality.finalScore}/100, SEO ${heuristics.score}/100)`,
          createdById: input.userId ?? null,
        },
      });

      await tx.content.update({
        where: { id: content.id },
        data: {
          currentVersionId: contentVersion.id,
          wordCount,
          seoScore: heuristics.score,
          status: ContentStatus.DRAFT,
        },
      });

      await tx.sEOAnalysis.create({
        data: {
          projectId: brief.projectId,
          contentId: content.id,
          score: heuristics.score,
          keyword,
          checks: toJson(heuristics.checks),
          suggestions: toJson({
            suggestions: heuristics.suggestions,
            quality: {
              score: quality.finalScore,
              aiScore: quality.aiScore,
              readability: quality.readability,
              keywordUsage: quality.keywordUsage,
              repetition: quality.repetition,
              completeness: quality.completeness,
              accuracy: quality.accuracy ?? null,
              issues: quality.issues,
              fixes: quality.fixes,
            },
            structure: {
              outline: seo.outline,
              faqs: seo.faqs,
              internalLinkSuggestions: seo.internalLinkSuggestions,
            },
          }),
        },
      });

      await tx.contentBrief.update({
        where: { id: brief.id },
        data: {
          status: BriefStatus.USED,
          outline: toJson(seo.outline),
          intent: brief.intent ?? seo.searchIntent,
        },
      });

      if (brief.keywordId) {
        await tx.keyword.updateMany({
          where: {
            id: brief.keywordId,
            status: {
              in: [KeywordStatus.DISCOVERED, KeywordStatus.SHORTLISTED, KeywordStatus.PLANNED],
            },
          },
          data: { status: KeywordStatus.IN_PROGRESS },
        });
      }

      return { content, contentVersion, slug };
    });

    // 7. Usage bookkeeping (AI credits are recorded per call by AIClient).
    await recordUsage(input.companyId, { words: wordCount });

    log.info(
      {
        contentId: persisted.content.id,
        version: persisted.contentVersion.version,
        wordCount,
        qualityScore: quality.finalScore,
        seoScore: heuristics.score,
        revised: quality.revised,
        aiCalls,
      },
      'Article generated',
    );

    return {
      contentId: persisted.content.id,
      versionId: persisted.contentVersion.id,
      version: persisted.contentVersion.version,
      title: seo.title,
      slug: persisted.slug,
      wordCount,
      qualityScore: quality.finalScore,
      seoScore: heuristics.score,
      revised: quality.revised,
      aiCalls,
      estimatedCostUsd,
    };
  }

  /** Published/approved pages in the project the writer may link to. */
  private async internalPages(projectId: string, excludeContentId?: string): Promise<string[]> {
    const rows = await prisma.content.findMany({
      where: {
        projectId,
        status: { in: [ContentStatus.PUBLISHED, ContentStatus.APPROVED, ContentStatus.SCHEDULED] },
        ...(excludeContentId ? { id: { not: excludeContentId } } : {}),
      },
      select: { title: true, slug: true, publishedUrl: true },
      orderBy: { publishedAt: 'desc' },
      take: 25,
    });
    return rows.map((r) => `${r.publishedUrl ?? `/${r.slug}`} — ${r.title}`);
  }

  private async uniqueSlug(
    tx: Prisma.TransactionClient,
    projectId: string,
    desired: string,
  ): Promise<string> {
    const base = slugify(desired) || 'article';
    let candidate = base;
    for (let i = 2; i < 100; i++) {
      const clash = await tx.content.findUnique({
        where: { projectId_slug: { projectId, slug: candidate } },
        select: { id: true },
      });
      if (!clash) return candidate;
      candidate = `${base}-${i}`;
    }
    return `${base}-${Date.now().toString(36)}`;
  }
}

export const orchestrator = new Orchestrator();
