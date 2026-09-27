/**
 * Pure, dependency-free on-page SEO analyzer.
 *
 * Works on an HTML string (no DOM) and returns a weighted 0-100 score together with the
 * individual checks so the UI can render a checklist. Used by the worker (`seo-analysis`
 * queue and the Quality Agent) and by the web app for live editor feedback.
 */

export type SeoCheckSeverity = 'info' | 'warning' | 'error';

export interface SeoCheck {
  key: string;
  label: string;
  passed: boolean;
  weight: number;
  message: string;
  severity: SeoCheckSeverity;
}

export interface SeoReadability {
  /** Flesch Reading Ease, clamped to 0-100. Higher is easier. */
  fleschReadingEase: number;
  /** Human readable grade band, e.g. "8th–9th grade". */
  grade: string;
  sentences: number;
  avgWordsPerSentence: number;
  avgSyllablesPerWord: number;
  passiveSentenceRatio: number;
}

export interface SeoHeading {
  level: number;
  text: string;
}

export interface SeoStats {
  title: string;
  titleLength: number;
  metaDescription: string;
  metaDescriptionLength: number;
  headings: SeoHeading[];
  h1Count: number;
  h2Count: number;
  h3Count: number;
  keywordOccurrences: number;
  keywordDensity: number;
  internalLinks: number;
  externalLinks: number;
  images: number;
  imagesWithoutAlt: number;
  paragraphs: number;
  longestParagraphWords: number;
  questionHeadings: number;
  secondaryKeywordsFound: string[];
  secondaryKeywordsMissing: string[];
}

export interface SeoAnalysisResult {
  score: number;
  wordCount: number;
  readability: SeoReadability;
  checks: SeoCheck[];
  suggestions: string[];
  stats: SeoStats;
}

export interface SeoAnalyzerInput {
  html: string;
  keyword: string;
  metaTitle?: string;
  metaDescription?: string;
  secondaryKeywords?: string[];
  /** When provided, absolute links to this host count as internal links. */
  siteDomain?: string;
}

export const SEO_LIMITS = {
  titleMin: 30,
  titleMax: 60,
  metaMin: 70,
  metaMax: 160,
  densityMin: 0.5,
  densityMax: 2.5,
  minH2: 3,
  minWords: 600,
  earlyWords: 100,
  maxParagraphWords: 150,
  minFlesch: 50,
  maxPassiveRatio: 0.15,
  minSecondaryCoverage: 0.6,
} as const;

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
  copy: '©',
  reg: '®',
  trade: '™',
};

export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => safeFromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => safeFromCodePoint(parseInt(dec, 10)))
    .replace(/&([a-z]+);/gi, (match, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? match);
}

function safeFromCodePoint(code: number): string {
  if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return '';
  try {
    return String.fromCodePoint(code);
  } catch {
    return '';
  }
}

/** Removes tags, scripts, styles and head content, keeping block boundaries as newlines. */
export function stripHtml(html: string): string {
  const withoutBlocks = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(
      /<(script|style|noscript|template|head|title|svg|iframe)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,
      ' ',
    )
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(
      /<\/(p|div|section|article|li|ul|ol|h[1-6]|tr|blockquote|pre|figure|figcaption|header|footer|nav|aside|table|dd|dt)\s*>/gi,
      '\n',
    )
    .replace(/<[^>]+>/g, ' ');
  return decodeHtmlEntities(withoutBlocks)
    .replace(/[ \t\f\v\u00a0]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

export function tokenizeWords(text: string): string[] {
  return text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w));
}

export function countWords(text: string): number {
  return tokenizeWords(text).length;
}

export function extractHeadings(html: string): SeoHeading[] {
  const headings: SeoHeading[] = [];
  const re = /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1\s*>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    headings.push({ level: Number(match[1]), text: stripHtml(match[2] ?? '').replace(/\n/g, ' ') });
  }
  return headings;
}

export function extractParagraphs(html: string): string[] {
  const paragraphs: string[] = [];
  const re = /<p\b[^>]*>([\s\S]*?)<\/p\s*>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const text = stripHtml(match[1] ?? '');
    if (text) paragraphs.push(text);
  }
  if (paragraphs.length > 0) return paragraphs;
  return stripHtml(html)
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function extractAttribute(tag: string, name: string): string | undefined {
  const re = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i');
  const match = re.exec(tag);
  if (!match) return undefined;
  return decodeHtmlEntities(match[2] ?? match[3] ?? match[4] ?? '').trim();
}

export function extractTitleTag(html: string): string | undefined {
  const match = /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(html);
  return match ? stripHtml(match[1] ?? '').replace(/\n/g, ' ') : undefined;
}

export function extractMetaDescription(html: string): string | undefined {
  const re = /<meta\b[^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const tag = match[0];
    const name = extractAttribute(tag, 'name') ?? extractAttribute(tag, 'property');
    if (name && name.toLowerCase() === 'description') {
      return extractAttribute(tag, 'content');
    }
  }
  return undefined;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim();
}

/** Counts non-overlapping, word-bounded occurrences of a phrase (case-insensitive). */
export function countPhraseOccurrences(text: string, phrase: string): number {
  const needle = normalize(phrase);
  if (!needle) return 0;
  const pattern = needle.split(' ').map(escapeRegExp).join('\\s+');
  const re = new RegExp(`(?<![\\p{L}\\p{N}])${pattern}(?![\\p{L}\\p{N}])`, 'giu');
  const matches = normalize(text).match(re);
  return matches ? matches.length : 0;
}

export function containsPhrase(text: string, phrase: string): boolean {
  return countPhraseOccurrences(text, phrase) > 0;
}

export function countSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return 0;
  if (w.length <= 3) return 1;
  const stripped = w.replace(/(?:[^laeiouy]es|[^aeiouy]ed|[^laeiouy]e)$/, '').replace(/^y/, '');
  const groups = stripped.match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups ? groups.length : 1);
}

export function splitSentences(text: string): string[] {
  return text
    .replace(/\n+/g, '. ')
    .split(/(?<=[.!?])\s+|(?<=[.!?])$/)
    .map((s) => s.trim())
    .filter((s) => countWords(s) > 0);
}

const PASSIVE_RE =
  /\b(am|is|are|was|were|be|been|being)\s+(\w+ed|\w+en|built|made|done|seen|known|found|given|taken|written|shown|held|kept|left|lost|paid|put|read|said|sold|sent|set|told|thought|won)\b/i;

export function computeReadability(text: string): SeoReadability {
  const sentences = splitSentences(text);
  const words = tokenizeWords(text);
  const sentenceCount = Math.max(1, sentences.length);
  const wordCount = Math.max(1, words.length);
  const syllables = words.reduce((sum, w) => sum + countSyllables(w), 0);
  const avgWordsPerSentence = wordCount / sentenceCount;
  const avgSyllablesPerWord = syllables / wordCount;
  const raw = 206.835 - 1.015 * avgWordsPerSentence - 84.6 * avgSyllablesPerWord;
  const fleschReadingEase = words.length === 0 ? 0 : clamp(Math.round(raw * 10) / 10, 0, 100);
  const passive = sentences.filter((s) => PASSIVE_RE.test(s)).length;
  return {
    fleschReadingEase,
    grade: fleschGrade(fleschReadingEase),
    sentences: sentences.length,
    avgWordsPerSentence: round(avgWordsPerSentence, 1),
    avgSyllablesPerWord: round(avgSyllablesPerWord, 2),
    passiveSentenceRatio: sentences.length ? round(passive / sentences.length, 3) : 0,
  };
}

export function fleschGrade(score: number): string {
  if (score >= 90) return '5th grade (very easy)';
  if (score >= 80) return '6th grade (easy)';
  if (score >= 70) return '7th grade (fairly easy)';
  if (score >= 60) return '8th–9th grade (plain English)';
  if (score >= 50) return '10th–12th grade (fairly difficult)';
  if (score >= 30) return 'College (difficult)';
  return 'College graduate (very difficult)';
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

const QUESTION_WORD_RE =
  /^(how|what|why|when|where|which|who|whom|whose|can|could|should|does|do|is|are|will|would|faq|faqs|frequently asked questions)\b/i;

function isQuestionHeading(text: string): boolean {
  const t = text.trim();
  return t.endsWith('?') || QUESTION_WORD_RE.test(t);
}

function isInternalLink(href: string, siteDomain?: string): boolean {
  const h = href.trim();
  if (!h || h.startsWith('#') || h.startsWith('mailto:') || h.startsWith('tel:')) return false;
  if (/^https?:\/\//i.test(h) || h.startsWith('//')) {
    if (!siteDomain) return false;
    try {
      const host = new URL(h.startsWith('//') ? `https:${h}` : h).hostname.toLowerCase();
      const domain = siteDomain.toLowerCase().replace(/^www\./, '');
      return host === domain || host.endsWith(`.${domain}`) || host === `www.${domain}`;
    } catch {
      return false;
    }
  }
  return true;
}

function isExternalLink(href: string, siteDomain?: string): boolean {
  const h = href.trim();
  if (!/^https?:\/\//i.test(h) && !h.startsWith('//')) return false;
  return !isInternalLink(h, siteDomain);
}

export function analyzeSeo(input: SeoAnalyzerInput): SeoAnalysisResult {
  const html = input.html ?? '';
  const keyword = (input.keyword ?? '').trim();
  const secondaryKeywords = (input.secondaryKeywords ?? []).map((k) => k.trim()).filter(Boolean);

  const headings = extractHeadings(html);
  const h1s = headings.filter((h) => h.level === 1);
  const h2s = headings.filter((h) => h.level === 2);
  const h3s = headings.filter((h) => h.level === 3);

  const title = (input.metaTitle ?? extractTitleTag(html) ?? h1s[0]?.text ?? '').trim();
  const metaDescription = (input.metaDescription ?? extractMetaDescription(html) ?? '').trim();

  const text = stripHtml(html);
  const words = tokenizeWords(text);
  const wordCount = words.length;
  const keywordWords = Math.max(1, countWords(keyword));
  const keywordOccurrences = keyword ? countPhraseOccurrences(text, keyword) : 0;
  const keywordDensity =
    wordCount > 0 ? round((keywordOccurrences * keywordWords * 100) / wordCount, 2) : 0;
  const first100 = words.slice(0, SEO_LIMITS.earlyWords).join(' ');

  const hrefs: string[] = [];
  const linkRe = /<a\b[^>]*>/gi;
  let linkMatch: RegExpExecArray | null;
  while ((linkMatch = linkRe.exec(html)) !== null) {
    const href = extractAttribute(linkMatch[0], 'href');
    if (href) hrefs.push(href);
  }
  const internalLinks = hrefs.filter((h) => isInternalLink(h, input.siteDomain)).length;
  const externalLinks = hrefs.filter((h) => isExternalLink(h, input.siteDomain)).length;

  const imgTags = html.match(/<img\b[^>]*>/gi) ?? [];
  const imagesWithoutAlt = imgTags.filter(
    (tag) => !(extractAttribute(tag, 'alt') ?? '').trim(),
  ).length;

  const paragraphs = extractParagraphs(html);
  const paragraphWordCounts = paragraphs.map(countWords);
  const longestParagraphWords = paragraphWordCounts.length ? Math.max(...paragraphWordCounts) : 0;

  const readability = computeReadability(text);
  const questionHeadings = headings.filter((h) => isQuestionHeading(h.text)).length;

  const lowerText = normalize(text);
  const secondaryKeywordsFound = secondaryKeywords.filter((k) => containsPhrase(lowerText, k));
  const secondaryKeywordsMissing = secondaryKeywords.filter(
    (k) => !secondaryKeywordsFound.includes(k),
  );

  const checks: SeoCheck[] = [];
  const add = (
    key: string,
    label: string,
    passed: boolean,
    weight: number,
    message: string,
    severity: SeoCheckSeverity = 'warning',
  ) => checks.push({ key, label, passed, weight, message, severity: passed ? 'info' : severity });

  // ── Title ──
  const titleLength = title.length;
  add(
    'title-length',
    'Title length',
    titleLength >= SEO_LIMITS.titleMin && titleLength <= SEO_LIMITS.titleMax,
    8,
    titleLength === 0
      ? 'No title found. Add a meta title between 30 and 60 characters.'
      : `Title is ${titleLength} characters (recommended ${SEO_LIMITS.titleMin}–${SEO_LIMITS.titleMax}).`,
    titleLength === 0 ? 'error' : 'warning',
  );
  add(
    'title-keyword',
    'Keyword in title',
    Boolean(keyword) && containsPhrase(title, keyword),
    8,
    keyword
      ? containsPhrase(title, keyword)
        ? 'The focus keyword appears in the title.'
        : `The focus keyword "${keyword}" is missing from the title.`
      : 'No focus keyword provided.',
    'error',
  );

  // ── Meta description ──
  const metaLength = metaDescription.length;
  add(
    'meta-length',
    'Meta description length',
    metaLength >= SEO_LIMITS.metaMin && metaLength <= SEO_LIMITS.metaMax,
    6,
    metaLength === 0
      ? 'No meta description. Write one between 70 and 160 characters with a clear value proposition.'
      : `Meta description is ${metaLength} characters (recommended ${SEO_LIMITS.metaMin}–${SEO_LIMITS.metaMax}).`,
    metaLength === 0 ? 'error' : 'warning',
  );
  add(
    'meta-keyword',
    'Keyword in meta description',
    Boolean(keyword) && containsPhrase(metaDescription, keyword),
    5,
    keyword && containsPhrase(metaDescription, keyword)
      ? 'The focus keyword appears in the meta description.'
      : 'Include the focus keyword naturally in the meta description.',
  );

  // ── H1 ──
  add(
    'h1-single',
    'Exactly one H1',
    h1s.length === 1,
    8,
    h1s.length === 1
      ? 'The page has exactly one H1.'
      : h1s.length === 0
        ? 'No H1 found. Add a single H1 that states the topic.'
        : `Found ${h1s.length} H1 headings; keep exactly one.`,
    'error',
  );
  add(
    'h1-keyword',
    'Keyword in H1',
    Boolean(keyword) && h1s.some((h) => containsPhrase(h.text, keyword)),
    6,
    keyword && h1s.some((h) => containsPhrase(h.text, keyword))
      ? 'The H1 contains the focus keyword.'
      : 'Put the focus keyword (or a close variant) in the H1.',
  );

  // ── Keyword density ──
  const densityOk =
    keywordDensity >= SEO_LIMITS.densityMin && keywordDensity <= SEO_LIMITS.densityMax;
  add(
    'keyword-density',
    'Keyword density',
    densityOk,
    8,
    !keyword
      ? 'No focus keyword provided.'
      : densityOk
        ? `Keyword density is ${keywordDensity}% (${keywordOccurrences} occurrences).`
        : keywordDensity < SEO_LIMITS.densityMin
          ? `Keyword density is ${keywordDensity}% — use the focus keyword a few more times (target ${SEO_LIMITS.densityMin}–${SEO_LIMITS.densityMax}%).`
          : `Keyword density is ${keywordDensity}% — this looks like stuffing; reduce to ${SEO_LIMITS.densityMin}–${SEO_LIMITS.densityMax}%.`,
    keywordDensity > SEO_LIMITS.densityMax ? 'error' : 'warning',
  );

  // ── Heading structure ──
  const bodyHeadings = headings.filter((h) => h.level >= 2);
  let hierarchyOk = bodyHeadings.length > 0;
  let previousLevel = 1;
  for (const h of bodyHeadings) {
    if (h.level > previousLevel + 1) {
      hierarchyOk = false;
      break;
    }
    previousLevel = h.level;
  }
  add(
    'heading-hierarchy',
    'Heading hierarchy',
    hierarchyOk,
    5,
    bodyHeadings.length === 0
      ? 'No H2/H3 headings found. Structure the article with descriptive subheadings.'
      : hierarchyOk
        ? 'Headings follow a logical hierarchy (H2 before H3).'
        : 'Heading levels are skipped (e.g. H3 without a preceding H2). Fix the hierarchy.',
  );
  add(
    'h2-count',
    'Enough H2 sections',
    h2s.length >= SEO_LIMITS.minH2,
    5,
    h2s.length >= SEO_LIMITS.minH2
      ? `${h2s.length} H2 sections found.`
      : `Only ${h2s.length} H2 heading(s). Aim for at least ${SEO_LIMITS.minH2} to cover the topic comprehensively.`,
  );

  // ── Keyword early ──
  const early = Boolean(keyword) && containsPhrase(first100, keyword);
  add(
    'keyword-early',
    'Keyword in the first 100 words',
    early,
    7,
    early
      ? 'The focus keyword appears in the introduction.'
      : 'Mention the focus keyword within the first 100 words.',
  );

  // ── Links ──
  add(
    'internal-links',
    'Internal links',
    internalLinks > 0,
    5,
    internalLinks > 0
      ? `${internalLinks} internal link(s) found.`
      : 'Add at least one internal link to related content on your site.',
  );
  add(
    'external-links',
    'External links',
    externalLinks > 0,
    4,
    externalLinks > 0
      ? `${externalLinks} external link(s) found.`
      : 'Cite at least one authoritative external source.',
    'info',
  );

  // ── Images ──
  add(
    'image-alt',
    'Images with alt text',
    imgTags.length > 0 && imagesWithoutAlt === 0,
    4,
    imgTags.length === 0
      ? 'No images found. Add at least one relevant image with descriptive alt text.'
      : imagesWithoutAlt === 0
        ? `All ${imgTags.length} image(s) have alt text.`
        : `${imagesWithoutAlt} of ${imgTags.length} image(s) are missing alt text.`,
    'info',
  );

  // ── FAQ / questions ──
  add(
    'faq-coverage',
    'Question / FAQ coverage',
    questionHeadings > 0,
    4,
    questionHeadings > 0
      ? `${questionHeadings} question-style heading(s) found.`
      : 'Answer common questions with question-style headings or an FAQ section.',
    'info',
  );

  // ── Paragraph length ──
  const paragraphsOk =
    paragraphs.length > 0 && longestParagraphWords <= SEO_LIMITS.maxParagraphWords;
  add(
    'paragraph-length',
    'Paragraph length',
    paragraphsOk,
    5,
    paragraphs.length === 0
      ? 'No paragraphs detected.'
      : paragraphsOk
        ? `Longest paragraph is ${longestParagraphWords} words.`
        : `Longest paragraph is ${longestParagraphWords} words. Break paragraphs longer than ${SEO_LIMITS.maxParagraphWords} words.`,
  );

  // ── Readability ──
  add(
    'readability',
    'Readability',
    wordCount > 0 && readability.fleschReadingEase >= SEO_LIMITS.minFlesch,
    7,
    `Flesch Reading Ease ${readability.fleschReadingEase} (${readability.grade}); average sentence ${readability.avgWordsPerSentence} words.`,
  );
  add(
    'passive-voice',
    'Active voice',
    readability.passiveSentenceRatio <= SEO_LIMITS.maxPassiveRatio,
    3,
    readability.passiveSentenceRatio <= SEO_LIMITS.maxPassiveRatio
      ? `About ${Math.round(readability.passiveSentenceRatio * 100)}% of sentences look passive.`
      : `About ${Math.round(readability.passiveSentenceRatio * 100)}% of sentences look passive. Rewrite most of them in active voice.`,
    'info',
  );

  // ── Secondary keywords (only when provided) ──
  if (secondaryKeywords.length > 0) {
    const coverage = secondaryKeywordsFound.length / secondaryKeywords.length;
    add(
      'secondary-keywords',
      'Secondary keyword coverage',
      coverage >= SEO_LIMITS.minSecondaryCoverage,
      5,
      secondaryKeywordsMissing.length === 0
        ? 'All secondary keywords are covered.'
        : `Missing secondary keywords: ${secondaryKeywordsMissing.slice(0, 6).join(', ')}.`,
    );
  }

  // ── Word count ──
  add(
    'word-count',
    'Word count',
    wordCount >= SEO_LIMITS.minWords,
    8,
    wordCount >= SEO_LIMITS.minWords
      ? `${wordCount} words.`
      : `${wordCount} words. Aim for at least ${SEO_LIMITS.minWords} words to cover the topic in depth.`,
    wordCount < SEO_LIMITS.minWords / 2 ? 'error' : 'warning',
  );

  const totalWeight = checks.reduce((sum, c) => sum + c.weight, 0);
  const passedWeight = checks.filter((c) => c.passed).reduce((sum, c) => sum + c.weight, 0);
  const score = totalWeight === 0 ? 0 : Math.round((passedWeight / totalWeight) * 100);

  const suggestions = checks
    .filter((c) => !c.passed)
    .sort((a, b) => b.weight - a.weight)
    .map((c) => c.message);

  return {
    score,
    wordCount,
    readability,
    checks,
    suggestions,
    stats: {
      title,
      titleLength,
      metaDescription,
      metaDescriptionLength: metaLength,
      headings,
      h1Count: h1s.length,
      h2Count: h2s.length,
      h3Count: h3s.length,
      keywordOccurrences,
      keywordDensity,
      internalLinks,
      externalLinks,
      images: imgTags.length,
      imagesWithoutAlt,
      paragraphs: paragraphs.length,
      longestParagraphWords,
      questionHeadings,
      secondaryKeywordsFound,
      secondaryKeywordsMissing,
    },
  };
}
