import { QUEUES, analyzeSeo } from '@acsp/shared';
import { EntityNotFoundError } from '../lib/errors';
import { prisma, toJson } from '../lib/prisma';
import { defineProcessor } from './define-processor';
import { seoAnalysisJobSchema } from './schemas';

/**
 * seo-analysis: runs the deterministic analyzer from @acsp/shared on the current version body,
 * stores an SEOAnalysis row and refreshes Content.seoScore. No AI credits are consumed.
 */
export const seoAnalysisProcessor = defineProcessor(
  QUEUES.SEO_ANALYSIS,
  seoAnalysisJobSchema,
  async ({ payload, log }) => {
    const content = await prisma.content.findFirst({
      where: { id: payload.contentId, project: { companyId: payload.companyId } },
      include: {
        currentVersion: true,
        keyword: { select: { term: true } },
        brief: { select: { secondaryKeywords: true, keyword: { select: { term: true } } } },
        project: { select: { website: { select: { domain: true } } } },
      },
    });
    if (!content) throw new EntityNotFoundError('Content', payload.contentId);

    const version =
      content.currentVersion ??
      (await prisma.contentVersion.findFirst({
        where: { contentId: content.id },
        orderBy: { version: 'desc' },
      }));
    if (!version) {
      throw new EntityNotFoundError('ContentVersion', `for content ${content.id}`);
    }

    const keyword =
      payload.keyword ?? content.keyword?.term ?? content.brief?.keyword?.term ?? content.title;

    const result = analyzeSeo({
      html: version.body,
      keyword,
      metaTitle: content.metaTitle ?? content.title,
      metaDescription: content.metaDescription ?? undefined,
      secondaryKeywords: content.brief?.secondaryKeywords ?? [],
      siteDomain: content.project.website?.domain ?? undefined,
    });

    const [analysis] = await prisma.$transaction([
      prisma.sEOAnalysis.create({
        data: {
          projectId: content.projectId,
          contentId: content.id,
          score: result.score,
          keyword,
          checks: toJson(result.checks),
          suggestions: toJson({
            suggestions: result.suggestions,
            readability: result.readability,
            stats: result.stats,
            versionId: version.id,
            version: version.version,
          }),
        },
      }),
      prisma.content.update({
        where: { id: content.id },
        data: { seoScore: result.score, wordCount: result.wordCount },
      }),
    ]);

    log.info(
      { contentId: content.id, score: result.score, wordCount: result.wordCount, keyword },
      'SEO analysis stored',
    );
    return {
      analysisId: analysis.id,
      score: result.score,
      wordCount: result.wordCount,
      failed: result.suggestions.length,
    };
  },
);
