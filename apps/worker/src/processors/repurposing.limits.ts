/**
 * Pure helpers for platform-specific length rules. No imports so they are trivially testable.
 * Platform names match the `SocialPlatform` enum in @acsp/shared / Prisma.
 */

export type RepurposePlatform =
  'FACEBOOK' | 'LINKEDIN' | 'INSTAGRAM' | 'X' | 'YOUTUBE' | 'EMAIL_NEWSLETTER' | 'SHORT_VIDEO';

export interface PlatformLimit {
  /** Maximum characters for the stored body. `null` = no hard limit (scripts / long-form). */
  maxChars: number | null;
  /** Whether hashtags are appended to the body and count towards `maxChars`. */
  hashtagsInBody: boolean;
  maxHashtags: number;
  label: string;
}

export const PLATFORM_LIMITS: Record<RepurposePlatform, PlatformLimit> = {
  X: { maxChars: 280, hashtagsInBody: true, maxHashtags: 3, label: 'X (Twitter)' },
  LINKEDIN: { maxChars: 3_000, hashtagsInBody: true, maxHashtags: 5, label: 'LinkedIn' },
  INSTAGRAM: { maxChars: 2_200, hashtagsInBody: true, maxHashtags: 30, label: 'Instagram' },
  FACEBOOK: { maxChars: 63_206, hashtagsInBody: true, maxHashtags: 3, label: 'Facebook' },
  YOUTUBE: { maxChars: null, hashtagsInBody: false, maxHashtags: 15, label: 'YouTube script' },
  EMAIL_NEWSLETTER: {
    maxChars: null,
    hashtagsInBody: false,
    maxHashtags: 0,
    label: 'Email newsletter',
  },
  SHORT_VIDEO: {
    maxChars: null,
    hashtagsInBody: false,
    maxHashtags: 5,
    label: 'Short-video script',
  },
};

export interface TruncateResult {
  body: string;
  hashtags: string[];
  truncated: boolean;
  /** Characters of the final stored body (hashtags included when they are part of the body). */
  length: number;
}

const ELLIPSIS = '…';

export function normalizeHashtag(tag: string): string | null {
  const cleaned = tag
    .trim()
    .replace(/^#+/, '')
    .replace(/[^\p{L}\p{N}_]/gu, '');
  return cleaned ? `#${cleaned}` : null;
}

export function normalizeHashtags(tags: readonly string[], max: number): string[] {
  const out: string[] = [];
  if (max <= 0) return out;
  const seen = new Set<string>();
  for (const raw of tags) {
    const tag = normalizeHashtag(raw);
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
    if (out.length >= max) break;
  }
  return out;
}

/** Cuts `text` to `max` characters at a word boundary and appends an ellipsis. */
export function truncateAtWord(text: string, max: number): string {
  if (max <= 0) return '';
  if (text.length <= max) return text;
  if (max <= ELLIPSIS.length) return ELLIPSIS.slice(0, max);
  const window = text.slice(0, max - ELLIPSIS.length);
  const endsOnBoundary = /\s/.test(text.charAt(window.length));
  const lastBreak = Math.max(window.lastIndexOf(' '), window.lastIndexOf('\n'));
  const cut = endsOnBoundary
    ? window
    : lastBreak > window.length * 0.6
      ? window.slice(0, lastBreak)
      : window;
  return `${cut.replace(/[\s,;:\-–—]+$/u, '')}${ELLIPSIS}`;
}

/**
 * Applies the platform's length rules. When hashtags belong in the body they are appended on a
 * new line and the text is shortened first so hashtags always survive (dropping hashtags is the
 * last resort).
 */
export function truncateForPlatform(
  platform: RepurposePlatform,
  body: string,
  hashtags: readonly string[] = [],
): TruncateResult {
  const limit = PLATFORM_LIMITS[platform];
  const text = body.replace(/\r\n/g, '\n').trim();
  let tags = normalizeHashtags(hashtags, limit.maxHashtags);

  if (!limit.hashtagsInBody) {
    const max = limit.maxChars;
    const finalBody = max === null ? text : truncateAtWord(text, max);
    return {
      body: finalBody,
      hashtags: tags,
      truncated: finalBody !== text,
      length: finalBody.length,
    };
  }

  const max = limit.maxChars ?? Number.POSITIVE_INFINITY;
  // Drop hashtags from the end until at least ~60% of the budget remains for the text.
  let suffix = tags.length ? `\n\n${tags.join(' ')}` : '';
  while (tags.length && suffix.length > max * 0.4) {
    tags = tags.slice(0, -1);
    suffix = tags.length ? `\n\n${tags.join(' ')}` : '';
  }

  const budget = Math.max(0, max - suffix.length);
  const trimmedText = truncateAtWord(text, budget);
  const combined = `${trimmedText}${suffix}`;
  return {
    body: combined,
    hashtags: tags,
    truncated: trimmedText !== text,
    length: combined.length,
  };
}

export function isWithinLimit(platform: RepurposePlatform, body: string): boolean {
  const max = PLATFORM_LIMITS[platform].maxChars;
  return max === null || body.length <= max;
}
