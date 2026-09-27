import { describe, expect, it } from 'vitest';
import {
  PLATFORM_LIMITS,
  isWithinLimit,
  normalizeHashtags,
  truncateAtWord,
  truncateForPlatform,
} from '../repurposing.limits';

const LONG = Array.from({ length: 120 }, (_, i) => `word${i}`).join(' '); // ~800 chars

describe('truncateAtWord', () => {
  it('returns short text untouched', () => {
    expect(truncateAtWord('hello world', 20)).toBe('hello world');
  });

  it('cuts at a word boundary and adds an ellipsis within the limit', () => {
    const out = truncateAtWord('the quick brown fox jumps over the lazy dog', 20);
    expect(out.length).toBeLessThanOrEqual(20);
    expect(out.endsWith('…')).toBe(true);
    expect(out).toBe('the quick brown fox…');
  });
});

describe('normalizeHashtags', () => {
  it('normalises, dedupes and caps hashtags', () => {
    expect(
      normalizeHashtags(['seo', '#SEO', '# content marketing', 'ai-tools', '', 'x'], 3),
    ).toEqual(['#seo', '#contentmarketing', '#aitools']);
  });
});

describe('truncateForPlatform', () => {
  it('keeps X posts within 280 characters including hashtags', () => {
    const result = truncateForPlatform('X', LONG, ['seo', 'content', 'ai', 'extra']);
    expect(result.length).toBeLessThanOrEqual(280);
    expect(result.body.length).toBeLessThanOrEqual(280);
    expect(result.truncated).toBe(true);
    expect(result.hashtags).toEqual(['#seo', '#content', '#ai']); // capped at 3
    expect(result.body.endsWith('#seo #content #ai')).toBe(true);
    expect(isWithinLimit('X', result.body)).toBe(true);
  });

  it('does not truncate short posts', () => {
    const result = truncateForPlatform('LINKEDIN', 'Short update.', ['b2b']);
    expect(result.truncated).toBe(false);
    expect(result.body).toBe('Short update.\n\n#b2b');
  });

  it('respects the Instagram 2200 limit and 30 hashtag cap', () => {
    const tags = Array.from({ length: 40 }, (_, i) => `tag${i}`);
    const result = truncateForPlatform('INSTAGRAM', LONG.repeat(4), tags);
    expect(result.hashtags).toHaveLength(30);
    expect(result.body.length).toBeLessThanOrEqual(PLATFORM_LIMITS.INSTAGRAM.maxChars!);
    expect(result.truncated).toBe(true);
  });

  it('leaves scripts and newsletters untouched and keeps hashtags separate', () => {
    const script = `HOOK: ...\n\n${LONG}\n\nCTA: subscribe`;
    const yt = truncateForPlatform('YOUTUBE', script, ['tutorial']);
    expect(yt.body).toBe(script);
    expect(yt.truncated).toBe(false);
    expect(yt.hashtags).toEqual(['#tutorial']);

    const email = truncateForPlatform('EMAIL_NEWSLETTER', `Subject: Hi\n\n${LONG}`, ['ignored']);
    expect(email.body.startsWith('Subject: Hi')).toBe(true);
    expect(email.hashtags).toEqual([]);
  });

  it('drops hashtags before starving the text on tiny budgets', () => {
    const many = Array.from({ length: 3 }, (_, i) => `averyveryverylonghashtagnumber${i}`);
    const result = truncateForPlatform('X', LONG, many);
    expect(result.body.length).toBeLessThanOrEqual(280);
    // text must still hold the majority of the budget
    const textPart = result.body.split('\n\n')[0]!;
    expect(textPart.length).toBeGreaterThan(280 * 0.5);
  });
});
