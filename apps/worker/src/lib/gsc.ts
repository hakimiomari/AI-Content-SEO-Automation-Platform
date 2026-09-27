import { logger } from './logger';

/**
 * Google Search Console client.
 *
 * Phase 6 adds the OAuth flow (consent screen, refresh-token exchange) in the API. Until then the
 * worker can only sync when the stored credentials already contain a valid `accessToken`; without
 * one it logs and returns no rows. The request/response handling below is the real GSC API shape,
 * so the OAuth refresh drops in via `ensureAccessToken()` without touching the processor.
 */

export interface GscCredentials {
  accessToken?: string;
  refreshToken?: string;
  clientId?: string;
  clientSecret?: string;
  /** Epoch ms when the access token expires. */
  expiryDate?: number;
  /** Property as registered in GSC, e.g. "sc-domain:example.com" or "https://www.example.com/". */
  siteUrl?: string;
}

export interface SearchAnalyticsRow {
  /** YYYY-MM-DD */
  date: string;
  page: string;
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export class GscAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GscAuthError';
  }
}

export const GSC_API_BASE = 'https://searchconsole.googleapis.com/webmasters/v3';
const ROW_LIMIT = 5_000;
const MAX_PAGES = 10;

/** Phase 6: exchange the refresh token for a fresh access token when expired. */
async function ensureAccessToken(credentials: GscCredentials): Promise<string | null> {
  if (
    credentials.accessToken &&
    (!credentials.expiryDate || credentials.expiryDate > Date.now() + 60_000)
  ) {
    return credentials.accessToken;
  }
  if (credentials.refreshToken) {
    // TODO(phase-6): POST https://oauth2.googleapis.com/token with grant_type=refresh_token and
    // persist the rotated token on the Integration row.
    logger.warn('GSC refresh token present but token refresh is not implemented yet (Phase 6).');
  }
  return credentials.accessToken ?? null;
}

interface GscApiRow {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

/**
 * Fetches daily page×query performance rows for `[from, to]` (inclusive, YYYY-MM-DD).
 * Returns an empty array when no usable access token exists.
 */
export async function fetchSearchAnalytics(
  credentials: GscCredentials,
  siteUrl: string,
  from: string,
  to: string,
): Promise<SearchAnalyticsRow[]> {
  const token = await ensureAccessToken(credentials);
  if (!token) {
    logger.warn(
      { siteUrl, from, to },
      'Google Search Console OAuth is not connected yet — analytics sync is a no-op until Phase 6 delivers the OAuth flow.',
    );
    return [];
  }

  const endpoint = `${GSC_API_BASE}/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;
  const rows: SearchAnalyticsRow[] = [];

  for (let page = 0; page < MAX_PAGES; page++) {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        startDate: from,
        endDate: to,
        dimensions: ['date', 'page', 'query'],
        rowLimit: ROW_LIMIT,
        startRow: page * ROW_LIMIT,
        dataState: 'final',
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (response.status === 401 || response.status === 403) {
      throw new GscAuthError(`Search Console rejected the credentials (HTTP ${response.status}).`);
    }
    if (!response.ok) {
      throw new Error(
        `Search Console API error HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`,
      );
    }

    const body = (await response.json()) as { rows?: GscApiRow[] };
    const batch = body.rows ?? [];
    for (const r of batch) {
      const [date = '', pageUrl = '', query = ''] = r.keys;
      rows.push({
        date: date.slice(0, 10),
        page: pageUrl,
        query,
        clicks: r.clicks ?? 0,
        impressions: r.impressions ?? 0,
        ctr: r.ctr ?? 0,
        position: r.position ?? 0,
      });
    }
    if (batch.length < ROW_LIMIT) break;
  }
  return rows;
}
