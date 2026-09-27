import { IntegrationProvider, IntegrationStatus } from '@acsp/database';
import { QUEUES } from '@acsp/shared';
import { UnrecoverableError } from 'bullmq';
import { decryptJson } from '../lib/crypto';
import { EntityNotFoundError, errorMessage } from '../lib/errors';
import {
  GscAuthError,
  fetchSearchAnalytics,
  type GscCredentials,
  type SearchAnalyticsRow,
} from '../lib/gsc';
import { prisma, toJson } from '../lib/prisma';
import { defineProcessor } from './define-processor';
import { analyticsSyncJobSchema } from './schemas';

const DEFAULT_LOOKBACK_DAYS = 28;
/** Search Console data is finalised with ~3 days delay. */
const GSC_LAG_DAYS = 3;
const UPSERT_BATCH = 50;

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function resolveDateRange(from?: string, to?: string): { from: string; to: string } {
  const end = to ? new Date(to) : new Date(Date.now() - GSC_LAG_DAYS * 86_400_000);
  const start = from
    ? new Date(from)
    : new Date(end.getTime() - DEFAULT_LOOKBACK_DAYS * 86_400_000);
  return { from: isoDay(start), to: isoDay(end) };
}

export async function upsertSnapshots(
  websiteId: string,
  rows: SearchAnalyticsRow[],
  source = 'gsc',
): Promise<number> {
  let written = 0;
  for (let i = 0; i < rows.length; i += UPSERT_BATCH) {
    const batch = rows.slice(i, i + UPSERT_BATCH);
    await prisma.$transaction(
      batch.map((row) =>
        prisma.analyticsSnapshot.upsert({
          where: {
            websiteId_date_page_query_source: {
              websiteId,
              date: new Date(row.date),
              page: row.page,
              query: row.query,
              source,
            },
          },
          create: {
            websiteId,
            date: new Date(row.date),
            page: row.page,
            query: row.query,
            source,
            clicks: row.clicks,
            impressions: row.impressions,
            ctr: row.ctr,
            position: row.position,
          },
          update: {
            clicks: row.clicks,
            impressions: row.impressions,
            ctr: row.ctr,
            position: row.position,
          },
        }),
      ),
    );
    written += batch.length;
  }
  return written;
}

/**
 * analytics-sync: pulls Search Console performance rows for a website and upserts
 * AnalyticsSnapshot records. Until the Phase 6 OAuth flow lands, `fetchSearchAnalytics` returns no
 * rows unless the stored credentials already hold an access token; the integration's `lastSyncAt`
 * is still updated so the UI can show the sync ran.
 */
export const analyticsSyncProcessor = defineProcessor(
  QUEUES.ANALYTICS_SYNC,
  analyticsSyncJobSchema,
  async ({ payload, log }) => {
    const [website, integration] = await Promise.all([
      prisma.website.findFirst({ where: { id: payload.websiteId, companyId: payload.companyId } }),
      prisma.integration.findFirst({
        where: {
          id: payload.integrationId,
          companyId: payload.companyId,
          provider: IntegrationProvider.GOOGLE_SEARCH_CONSOLE,
        },
      }),
    ]);
    if (!website) throw new EntityNotFoundError('Website', payload.websiteId);
    if (!integration)
      throw new EntityNotFoundError('Integration (GOOGLE_SEARCH_CONSOLE)', payload.integrationId);
    if (integration.status === IntegrationStatus.DISCONNECTED) {
      throw new UnrecoverableError(`Integration ${integration.id} is disconnected.`);
    }

    let credentials: GscCredentials = {};
    try {
      credentials = decryptJson<GscCredentials>(integration.credentials);
    } catch (err) {
      const message = `Cannot decrypt Search Console credentials: ${errorMessage(err)}`;
      await prisma.integration.update({
        where: { id: integration.id },
        data: { status: IntegrationStatus.ERROR, lastError: message },
      });
      throw new UnrecoverableError(message);
    }

    const config = (integration.config ?? {}) as { siteUrl?: string };
    const siteUrl = credentials.siteUrl ?? config.siteUrl ?? `sc-domain:${website.domain}`;
    const range = resolveDateRange(payload.from, payload.to);
    log.info({ siteUrl, ...range }, 'Syncing Search Console analytics');

    try {
      const rows = await fetchSearchAnalytics(credentials, siteUrl, range.from, range.to);
      const written = rows.length ? await upsertSnapshots(website.id, rows) : 0;
      if (!rows.length) {
        log.info('No analytics rows returned (Google Search Console OAuth arrives in Phase 6).');
      }

      await prisma.integration.update({
        where: { id: integration.id },
        data: {
          lastSyncAt: new Date(),
          lastError: null,
          status: IntegrationStatus.CONNECTED,
          config: toJson({ ...config, siteUrl, lastSyncRange: range, lastSyncRows: rows.length }),
        },
      });

      return { websiteId: website.id, rows: rows.length, written, ...range };
    } catch (err) {
      const message = errorMessage(err);
      if (err instanceof GscAuthError) {
        await prisma.integration.update({
          where: { id: integration.id },
          data: { status: IntegrationStatus.EXPIRED, lastError: message },
        });
        throw new UnrecoverableError(message);
      }
      await prisma.integration.update({
        where: { id: integration.id },
        data: { lastError: message },
      });
      throw err;
    }
  },
);
