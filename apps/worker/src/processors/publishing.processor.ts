import {
  ContentStatus,
  IntegrationProvider,
  IntegrationStatus,
  KeywordStatus,
  NotificationType,
  ScheduleStatus,
  SocialPostStatus,
  type Integration,
} from '@acsp/database';
import { QUEUES } from '@acsp/shared';
import { UnrecoverableError } from 'bullmq';
import { decryptJson } from '../lib/crypto';
import { EntityNotFoundError, errorMessage } from '../lib/errors';
import { notify } from '../lib/notifications';
import { prisma, toJson } from '../lib/prisma';
import { stripLeadingH1 } from '../lib/text';
import { defineProcessor } from './define-processor';
import { publishingJobSchema } from './schemas';

export interface WordPressCredentials {
  siteUrl?: string;
  username: string;
  applicationPassword?: string;
  password?: string;
}

export interface WordPressPublishResult {
  provider: 'WORDPRESS';
  postId: number;
  url: string;
  status: string;
}

class PublishFailedError extends Error {
  constructor(
    message: string,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'PublishFailedError';
  }
}

/** Publishes a post through the WordPress REST API using an application password. */
export async function publishToWordPress(
  integration: Integration,
  post: {
    title: string;
    slug: string;
    content: string;
    excerpt?: string | null;
    metaTitle?: string | null;
    metaDescription?: string | null;
  },
): Promise<WordPressPublishResult> {
  let credentials: WordPressCredentials;
  try {
    credentials = decryptJson<WordPressCredentials>(integration.credentials);
  } catch (err) {
    throw new PublishFailedError(
      `Cannot decrypt WordPress credentials: ${errorMessage(err)}`,
      false,
    );
  }

  const config = (integration.config ?? {}) as {
    siteUrl?: string;
    status?: string;
    categories?: number[];
    author?: number;
  };
  const siteUrl = (credentials.siteUrl ?? config.siteUrl ?? '').replace(/\/+$/, '');
  const secret = credentials.applicationPassword ?? credentials.password;
  if (!siteUrl || !credentials.username || !secret) {
    throw new PublishFailedError(
      'WordPress integration is missing siteUrl, username or application password.',
      false,
    );
  }

  const endpoint = `${siteUrl}/wp-json/wp/v2/posts`;
  const auth = Buffer.from(`${credentials.username}:${secret}`).toString('base64');

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        title: post.title,
        slug: post.slug,
        content: post.content,
        excerpt: post.excerpt ?? undefined,
        status: config.status ?? 'publish',
        ...(config.categories?.length ? { categories: config.categories } : {}),
        ...(config.author ? { author: config.author } : {}),
        // TODO: map metaTitle/metaDescription to the installed SEO plugin's meta fields
        // (Yoast: yoast_head_json is read-only via REST; RankMath: rank_math_title / rank_math_description).
      }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err) {
    throw new PublishFailedError(`WordPress request failed: ${errorMessage(err)}`, true);
  }

  if (!response.ok) {
    const text = (await response.text()).slice(0, 500);
    const retryable = response.status >= 500 || response.status === 429;
    throw new PublishFailedError(`WordPress responded HTTP ${response.status}: ${text}`, retryable);
  }

  const data = (await response.json()) as { id?: number; link?: string; status?: string };
  if (!data.id || !data.link)
    throw new PublishFailedError('WordPress response did not include a post id/link.', false);
  return {
    provider: 'WORDPRESS',
    postId: data.id,
    url: data.link,
    status: data.status ?? 'publish',
  };
}

/**
 * publishing: executes a Schedule. WordPress is supported now; other providers are marked FAILED
 * with "provider not yet supported". Transient errors are retried by BullMQ (schedule goes back to
 * PENDING); permanent errors fail the schedule immediately.
 */
export const publishingProcessor = defineProcessor(
  QUEUES.PUBLISHING,
  publishingJobSchema,
  async ({ payload, jobId, log, isLastAttempt }) => {
    const schedule = await prisma.schedule.findFirst({
      where: { id: payload.scheduleId, project: { companyId: payload.companyId } },
      include: {
        content: { include: { currentVersion: true } },
        socialPost: true,
        integration: true,
        project: { select: { id: true, companyId: true } },
      },
    });
    if (!schedule) throw new EntityNotFoundError('Schedule', payload.scheduleId);

    if (
      schedule.status === ScheduleStatus.CANCELED ||
      schedule.status === ScheduleStatus.PUBLISHED
    ) {
      log.info({ status: schedule.status }, 'Schedule no longer actionable; skipping');
      return { skipped: true, status: schedule.status };
    }

    await prisma.schedule.update({
      where: { id: schedule.id },
      data: { status: ScheduleStatus.PROCESSING, attempts: { increment: 1 }, jobId },
    });

    const fail = async (message: string, retryable: boolean) => {
      const finalFailure = !retryable || isLastAttempt;
      await prisma.schedule.update({
        where: { id: schedule.id },
        data: {
          status: finalFailure ? ScheduleStatus.FAILED : ScheduleStatus.PENDING,
          lastError: message.slice(0, 2_000),
        },
      });
      if (finalFailure) {
        if (schedule.contentId) {
          await prisma.content
            .update({ where: { id: schedule.contentId }, data: { status: ContentStatus.FAILED } })
            .catch(() => undefined);
        }
        if (schedule.socialPostId) {
          await prisma.socialPost
            .update({
              where: { id: schedule.socialPostId },
              data: { status: SocialPostStatus.FAILED },
            })
            .catch(() => undefined);
        }
        await notify({
          companyId: payload.companyId,
          userId: payload.userId,
          type: NotificationType.ERROR,
          title: 'Publishing failed',
          message: message.slice(0, 1_000),
          link: schedule.contentId ? `/content/${schedule.contentId}` : `/calendar`,
        });
      }
    };

    const integration = schedule.integration;
    if (!integration) {
      await fail('Schedule has no integration attached.', false);
      throw new UnrecoverableError('Schedule has no integration attached.');
    }
    if (integration.status !== IntegrationStatus.CONNECTED) {
      await fail(`Integration "${integration.name}" is ${integration.status}.`, false);
      throw new UnrecoverableError(`Integration is ${integration.status}`);
    }

    // Social platforms + other CMSes land in later phases.
    if (integration.provider !== IntegrationProvider.WORDPRESS || !schedule.content) {
      const reason = !schedule.content
        ? `Publishing ${schedule.socialPost ? schedule.socialPost.platform : 'this item'} via ${integration.provider} is not yet supported.`
        : `Provider ${integration.provider} not yet supported.`;
      await fail(reason, false);
      log.warn({ provider: integration.provider }, 'Provider not yet supported');
      return { published: false, reason };
    }

    const content = schedule.content;
    const version =
      content.currentVersion ??
      (await prisma.contentVersion.findFirst({
        where: { contentId: content.id },
        orderBy: { version: 'desc' },
      }));
    if (!version) {
      await fail('Content has no version to publish.', false);
      throw new UnrecoverableError('Content has no version to publish.');
    }

    try {
      const result = await publishToWordPress(integration, {
        title: content.title,
        slug: content.slug,
        content: stripLeadingH1(version.body),
        excerpt: content.excerpt,
        metaTitle: content.metaTitle,
        metaDescription: content.metaDescription,
      });

      const publishedAt = new Date();
      await prisma.$transaction([
        prisma.content.update({
          where: { id: content.id },
          data: { status: ContentStatus.PUBLISHED, publishedUrl: result.url, publishedAt },
        }),
        prisma.schedule.update({
          where: { id: schedule.id },
          data: {
            status: ScheduleStatus.PUBLISHED,
            lastError: null,
            result: toJson({ ...result, publishedAt, versionId: version.id }),
          },
        }),
        prisma.integration.update({
          where: { id: integration.id },
          data: { lastSyncAt: publishedAt, lastError: null },
        }),
        ...(content.keywordId
          ? [
              prisma.keyword.update({
                where: { id: content.keywordId },
                data: { status: KeywordStatus.PUBLISHED },
              }),
            ]
          : []),
      ]);

      await notify({
        companyId: payload.companyId,
        userId: payload.userId,
        type: NotificationType.SUCCESS,
        title: `Published: ${content.title}`,
        message: `Live on ${integration.name}: ${result.url}`,
        link: `/content/${content.id}`,
      });

      log.info({ contentId: content.id, url: result.url }, 'Published to WordPress');
      return { published: true, ...result };
    } catch (err) {
      const retryable = err instanceof PublishFailedError ? err.retryable : true;
      const message = errorMessage(err);
      await fail(message, retryable);
      if (!retryable) {
        await prisma.integration
          .update({
            where: { id: integration.id },
            data: {
              lastError: message.slice(0, 1_000),
              ...(/HTTP 401|HTTP 403/.test(message) ? { status: IntegrationStatus.ERROR } : {}),
            },
          })
          .catch(() => undefined);
        throw new UnrecoverableError(message);
      }
      throw err;
    }
  },
);
