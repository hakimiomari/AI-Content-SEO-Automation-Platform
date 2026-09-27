import { ContentStatus, NotificationType } from '@acsp/database';
import { QUEUES } from '@acsp/shared';
import { orchestrator } from '../agents/orchestrator';
import { errorMessage } from '../lib/errors';
import { notify } from '../lib/notifications';
import { prisma } from '../lib/prisma';
import { defineProcessor } from './define-processor';
import { contentGenerationJobSchema } from './schemas';

/**
 * content-generation: marks the Content GENERATING (when one exists), runs the Orchestrator
 * (SEO → Writing → Quality) and leaves the result as a DRAFT. On failure the content is marked
 * FAILED and the requesting user is notified on the final attempt.
 */
export const contentGenerationProcessor = defineProcessor(
  QUEUES.CONTENT_GENERATION,
  contentGenerationJobSchema,
  async ({ payload, jobId, log, isLastAttempt }) => {
    if (payload.contentId) {
      await prisma.content.updateMany({
        where: {
          id: payload.contentId,
          projectId: payload.projectId,
          project: { companyId: payload.companyId },
        },
        data: { status: ContentStatus.GENERATING },
      });
    }

    try {
      const result = await orchestrator.generateArticle({
        companyId: payload.companyId,
        userId: payload.userId,
        projectId: payload.projectId,
        briefId: payload.briefId,
        contentId: payload.contentId,
        jobId,
        logger: log,
      });

      await notify({
        companyId: payload.companyId,
        userId: payload.userId,
        type: NotificationType.SUCCESS,
        title: `Draft ready: ${result.title}`,
        message: `${result.wordCount} words · quality ${result.qualityScore}/100 · SEO ${result.seoScore}/100${result.revised ? ' · revised once by the Quality Agent' : ''}.`,
        link: `/content/${result.contentId}`,
      });

      return result;
    } catch (err) {
      const message = errorMessage(err);
      const unrecoverable =
        err instanceof Error &&
        err.name !== 'Error' &&
        /Unrecoverable|PlanLimit|AIConfiguration|EntityNotFound|InvalidJobPayload/.test(err.name);
      const finalFailure = isLastAttempt || unrecoverable;

      if (payload.contentId) {
        await prisma.content
          .updateMany({
            where: { id: payload.contentId, projectId: payload.projectId },
            data: { status: finalFailure ? ContentStatus.FAILED : ContentStatus.GENERATING },
          })
          .catch((e: unknown) => log.error({ err: e }, 'Failed to mark content as FAILED'));
      }

      if (finalFailure) {
        await notify({
          companyId: payload.companyId,
          userId: payload.userId,
          type: NotificationType.ERROR,
          title: 'Content generation failed',
          message: message.slice(0, 1_000),
          link: payload.contentId
            ? `/content/${payload.contentId}`
            : `/projects/${payload.projectId}/briefs/${payload.briefId}`,
        });
      }
      throw err;
    }
  },
);
