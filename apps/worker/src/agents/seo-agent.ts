import { AIFeature } from '@acsp/database';
import { SearchIntents, type ContentType, type SearchIntent } from '@acsp/shared';
import { z } from 'zod';
import { slugify, truncateText } from '../lib/text';
import { BaseAgent, EDITORIAL_RULES, type AgentContext } from './base-agent';

export interface SeoAgentInput {
  keyword: string;
  secondaryKeywords?: string[];
  /** Working title from the brief (may be rewritten). */
  title?: string | null;
  contentType: ContentType;
  intent?: SearchIntent | null;
  audience?: string | null;
  tone?: string | null;
  /** People-also-ask / FAQ candidates from the brief. */
  questions?: string[];
  targetWords: number;
  /** Existing outline from the brief (JSON) — respected when present. */
  existingOutline?: unknown;
  notes?: string | null;
  businessProfile?: unknown;
  websiteDomain?: string | null;
  language?: string;
  /** Known pages on the site (URL or "/slug — Title") for internal linking. */
  internalPages?: string[];
}

const intentSchema = z
  .string()
  .transform((s) => s.toUpperCase().trim())
  .pipe(z.enum(SearchIntents))
  .catch('INFORMATIONAL' as SearchIntent);

export const seoStructureSchema = z.object({
  title: z
    .string()
    .min(3)
    .max(200)
    .transform((s) => s.trim()),
  metaTitle: z
    .string()
    .min(3)
    .transform((s) => truncateText(s.trim(), 65)),
  metaDescription: z
    .string()
    .min(20)
    .transform((s) => truncateText(s.trim(), 160)),
  slug: z
    .string()
    .min(1)
    .transform((s) => slugify(s)),
  h1: z
    .string()
    .min(3)
    .max(200)
    .transform((s) => s.trim()),
  searchIntent: intentSchema,
  outline: z
    .array(
      z.object({
        h2: z.string().min(2).max(200),
        h3s: z.array(z.string().min(1).max(200)).catch([]),
        keyPoints: z.array(z.string().max(300)).catch([]),
        targetWords: z.coerce.number().int().min(50).max(3_000).optional().catch(undefined),
      }),
    )
    .min(2),
  faqs: z
    .array(
      z.object({
        question: z.string().min(3).max(200),
        answer: z.string().max(600).catch(''),
      }),
    )
    .catch([]),
  internalLinkSuggestions: z
    .array(
      z.object({
        anchor: z.string().min(1).max(120),
        target: z.string().min(1).max(500),
        reason: z.string().max(300).catch(''),
      }),
    )
    .catch([]),
});

export type SeoStructure = z.infer<typeof seoStructureSchema>;
export type SeoAgentOutput = SeoStructure & { calls: number };

/** Recommended number of H2 sections for a given length. */
export function recommendedSectionCount(targetWords: number): number {
  return Math.max(3, Math.min(12, Math.round(targetWords / 300)));
}

/**
 * SEO Agent — turns a brief/keyword into a search-optimised structure: title, metadata, slug,
 * H1, heading outline, FAQs and internal link suggestions.
 */
export class SeoAgent extends BaseAgent<SeoAgentInput, SeoAgentOutput> {
  readonly name = 'seo-agent';
  readonly feature = AIFeature.CONTENT_BRIEF;

  async run(input: SeoAgentInput, ctx: AgentContext): Promise<SeoAgentOutput> {
    const language = input.language ?? 'en';
    const sections = recommendedSectionCount(input.targetWords);

    const system = `You are an SEO content architect. You design article structures that win the SERP for a focus keyword while genuinely serving the reader.

${EDITORIAL_RULES}

Structure rules:
- title: compelling, specific, ≤ 70 chars, contains the focus keyword (or an exact-order variant) near the start. No clickbait, no ALL CAPS.
- metaTitle: 30–60 chars, focus keyword first, brand-free (the CMS appends the brand).
- metaDescription: 120–155 chars, contains the focus keyword once, states the concrete benefit, ends with a soft call to action.
- slug: 3–6 lowercase words, hyphenated, contains the focus keyword, no stop-words or dates.
- h1: may differ slightly from title; contains the focus keyword.
- outline: exactly ${sections} H2 sections (±1) that together satisfy the search intent completely and in a logical order: definition/context → core steps or comparison → nuances/pitfalls → decision help. Each H2 has 0–4 H3s and 2–4 keyPoints (facts, steps or angles the writer must cover). Spread secondary keywords across H2/H3 text naturally. Do NOT include an intro, FAQ or conclusion section — those are added automatically.
- Set per-section targetWords so the sum ≈ ${Math.round(input.targetWords * 0.8)} words (the rest is intro/FAQ/conclusion).
- faqs: 3–6 real questions people ask (use provided questions first), each with a 40–80 word factual answer draft.
- internalLinkSuggestions: only use targets from the provided internal pages; if none are provided, return an empty array.
- Content type "${input.contentType}" — adapt the structure (e.g. LISTICLE → numbered H2s, COMPARISON → criteria sections + verdict, LANDING_PAGE → benefit-led sections + objections).
- Language: ${language}.`;

    const user = this.assemble(
      this.block('Focus keyword', input.keyword),
      this.block('Secondary keywords', input.secondaryKeywords ?? []),
      this.block('Working title (rewrite if it can be stronger)', input.title ?? undefined),
      this.block('Search intent (if known)', input.intent ?? undefined),
      this.block('Target length (words)', String(input.targetWords)),
      this.block('Audience', input.audience ?? undefined),
      this.block('Tone', input.tone ?? undefined),
      this.block('Questions people ask', input.questions ?? []),
      this.block('Existing outline to respect', input.existingOutline),
      this.block('Brief notes', input.notes ?? undefined),
      this.block('Business profile', input.businessProfile),
      this.block('Website', input.websiteDomain ?? undefined),
      this.block('Internal pages available for linking', (input.internalPages ?? []).slice(0, 40)),
      this.jsonContract(`{
  "title": "<string>",
  "metaTitle": "<string 30-60 chars>",
  "metaDescription": "<string 120-155 chars>",
  "slug": "<string>",
  "h1": "<string>",
  "searchIntent": "<INFORMATIONAL|NAVIGATIONAL|COMMERCIAL|TRANSACTIONAL>",
  "outline": [
    { "h2": "<string>", "h3s": ["<string>"], "keyPoints": ["<string>"], "targetWords": <integer> }
  ],
  "faqs": [ { "question": "<string>", "answer": "<string>" } ],
  "internalLinkSuggestions": [ { "anchor": "<string>", "target": "<url or path>", "reason": "<string>" } ]
}`),
    );

    const { data, calls } = await this.completeJson(ctx, {
      schema: seoStructureSchema,
      system,
      user,
      temperature: 0.4,
      maxTokens: 4_000,
      metadata: { keyword: input.keyword },
    });

    // Guarantee the keyword shows up where it matters; the writer relies on these.
    const kw = input.keyword.toLowerCase();
    const h1 = data.h1.toLowerCase().includes(kw) ? data.h1 : data.title;
    const slug = data.slug.includes(slugify(input.keyword))
      ? data.slug
      : slugify(`${input.keyword} ${data.slug}`);

    this.log(ctx).info(
      { sections: data.outline.length, faqs: data.faqs.length },
      'SEO structure ready',
    );
    return { ...data, h1, slug, calls };
  }
}
