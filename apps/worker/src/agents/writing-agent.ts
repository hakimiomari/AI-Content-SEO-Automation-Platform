import { AIFeature } from '@acsp/database';
import { countWords, stripHtml, type ContentType } from '@acsp/shared';
import { normalizeHtmlBody } from '../lib/text';
import type { CompletionUsage } from '../lib/ai';
import { BaseAgent, EDITORIAL_RULES, sumUsage, type AgentContext } from './base-agent';
import type { SeoStructure } from './seo-agent';

export interface WritingAgentInput {
  seo: SeoStructure;
  keyword: string;
  secondaryKeywords?: string[];
  contentType: ContentType;
  audience?: string | null;
  tone?: string | null;
  brandVoice?: string | null;
  businessProfile?: unknown;
  notes?: string | null;
  targetWords: number;
  language?: string;
  websiteDomain?: string | null;
}

export interface WritingAgentOutput {
  /** Body HTML starting with exactly one <h1>. */
  html: string;
  wordCount: number;
  mode: 'single' | 'sectioned';
  calls: number;
  usage: CompletionUsage;
}

/** Above this length the article is written section by section to keep quality high. */
export const SECTIONED_THRESHOLD_WORDS = 1_500;
/** Maximum words requested from a single model call in sectioned mode. */
const MAX_WORDS_PER_CALL = 1_000;
const INTRO_WORDS = 130;
const CONCLUSION_WORDS = 120;
const FAQ_ANSWER_WORDS = 55;

type OutlineSection = SeoStructure['outline'][number];

interface Chunk {
  sections: OutlineSection[];
  words: number;
}

const ALLOWED_TAGS =
  '<h2>, <h3>, <p>, <ul>, <ol>, <li>, <strong>, <em>, <a href="...">, <blockquote>, <table>/<thead>/<tbody>/<tr>/<th>/<td>';

/** Estimated number of model calls for a given length (used for plan-limit pre-checks). */
export function estimateWriterCalls(targetWords: number): number {
  if (targetWords <= SECTIONED_THRESHOLD_WORDS) return 1;
  return Math.ceil(targetWords / MAX_WORDS_PER_CALL) + 1;
}

function maxTokensForWords(words: number): number {
  // ~1.5 tokens per English word plus HTML overhead; cap below common 16k output limits.
  return Math.min(16_000, Math.round(words * 1.9) + 700);
}

export function planChunks(outline: OutlineSection[], bodyWords: number): Chunk[] {
  const fallback = Math.max(120, Math.round(bodyWords / Math.max(1, outline.length)));
  const chunks: Chunk[] = [];
  let current: Chunk = { sections: [], words: 0 };
  for (const section of outline) {
    const words = section.targetWords ?? fallback;
    if (current.sections.length > 0 && current.words + words > MAX_WORDS_PER_CALL) {
      chunks.push(current);
      current = { sections: [], words: 0 };
    }
    current.sections.push(section);
    current.words += words;
  }
  if (current.sections.length > 0) chunks.push(current);
  return chunks;
}

/**
 * Writing Agent — drafts the article body as clean HTML that honours the SEO structure, target
 * length, audience and brand voice. Long articles (> 1500 words) are produced section by section
 * with a rolling context so the model never repeats itself or loses the thread.
 */
export class WritingAgent extends BaseAgent<WritingAgentInput, WritingAgentOutput> {
  readonly name = 'writing-agent';
  readonly feature = AIFeature.CONTENT_GENERATION;

  async run(input: WritingAgentInput, ctx: AgentContext): Promise<WritingAgentOutput> {
    const mode = input.targetWords > SECTIONED_THRESHOLD_WORDS ? 'sectioned' : 'single';
    const result =
      mode === 'single'
        ? await this.writeSingle(input, ctx)
        : await this.writeSectioned(input, ctx);

    let html = normalizeHtmlBody(result.html);
    // Exactly one H1: drop whatever the model produced and prepend the agreed H1.
    html = html.replace(/<h1\b[^>]*>[\s\S]*?<\/h1>\s*/gi, '');
    html = `<h1>${escapeHtml(input.seo.h1)}</h1>\n${html}`;

    const wordCount = countWords(stripHtml(html));
    this.log(ctx).info(
      { mode, wordCount, calls: result.calls, target: input.targetWords },
      'Draft written',
    );
    return { html, wordCount, mode, calls: result.calls, usage: result.usage };
  }

  // ── Prompts ──────────────────────────────────────────────────────────────

  private systemPrompt(input: WritingAgentInput): string {
    const language = input.language ?? 'en';
    return `You are an expert ${input.contentType.replace(/_/g, ' ').toLowerCase()} writer with deep subject-matter knowledge and years of hands-on experience. You write like a knowledgeable practitioner talking to a smart peer — direct, specific, useful.

${EDITORIAL_RULES}

Output format rules:
- Return HTML only. Allowed tags: ${ALLOWED_TAGS}. No <html>, <head>, <body>, <h1>, <div>, <span>, <script>, <style>, inline styles, classes or markdown.
- Use the section headings EXACTLY as given (same wording) as <h2>; use the given H3s as <h3> in order. Do not add or remove H2 sections.
- Paragraphs: 2–4 sentences. Use <ul>/<ol> for steps, checklists and comparisons; use a <table> when comparing 3+ options on 2+ criteria.
- Use the focus keyword naturally: once in the first 100 words, in 1–2 subheadings, once in the conclusion, and a few times in the body — total density about 1–2%. Never stuff.
- Weave secondary keywords in naturally where they fit; do not force them.
- Internal links: only link to the suggested internal targets, using the suggested anchor text inline in a sentence (max one link per suggestion).
- External links: only to widely recognised authoritative sources (official docs, standards bodies, government/academic sites) when you are certain the domain is correct; otherwise no external link.
- Language: ${language}. Use consistent spelling conventions for that language/region.
${input.brandVoice ? `- Brand voice: ${input.brandVoice}` : ''}
${input.tone ? `- Tone: ${input.tone}` : ''}`.trim();
  }

  private contextBlocks(input: WritingAgentInput): string[] {
    return [
      this.block('Article title', input.seo.title),
      this.block('H1 (already rendered — do not repeat)', input.seo.h1),
      this.block('Focus keyword', input.keyword),
      this.block('Secondary keywords', input.secondaryKeywords ?? []),
      this.block('Search intent', input.seo.searchIntent),
      this.block('Audience', input.audience ?? undefined),
      this.block('Business context', input.businessProfile),
      this.block('Website', input.websiteDomain ?? undefined),
      this.block('Brief notes', input.notes ?? undefined),
      this.block(
        'Internal link suggestions',
        input.seo.internalLinkSuggestions.map((l) => `${l.anchor} → ${l.target}`),
      ),
    ];
  }

  private outlineText(sections: OutlineSection[]): string {
    return sections
      .map((s, i) => {
        const h3s = s.h3s.length ? `\n  H3s: ${s.h3s.join(' | ')}` : '';
        const points = s.keyPoints.length ? `\n  Cover: ${s.keyPoints.join('; ')}` : '';
        const words = s.targetWords ? `\n  Length: ~${s.targetWords} words` : '';
        return `${i + 1}. H2: ${s.h2}${h3s}${points}${words}`;
      })
      .join('\n');
  }

  private faqText(input: WritingAgentInput): string {
    return input.seo.faqs
      .map((f) => `- Q: ${f.question}${f.answer ? `\n  Draft answer: ${f.answer}` : ''}`)
      .join('\n');
  }

  // ── Single call ───────────────────────────────────────────────────────────

  private async writeSingle(input: WritingAgentInput, ctx: AgentContext) {
    const user = this.assemble(
      ...this.contextBlocks(input),
      this.block('Target length', `${input.targetWords} words (±10%)`),
      this.block(
        'Section outline (use these H2/H3 exactly, in order)',
        this.outlineText(input.seo.outline),
      ),
      this.block(
        'FAQ (add as an <h2>Frequently Asked Questions</h2> section with <h3> questions)',
        this.faqText(input),
      ),
      [
        'Write the complete article body now:',
        "1. Introduction (no heading): 2 short paragraphs — hook with the reader's real problem, state what they will get, include the focus keyword.",
        '2. Every outlined section in order.',
        input.seo.faqs.length ? '3. The FAQ section.' : '',
        `${input.seo.faqs.length ? 4 : 3}. <h2>Conclusion</h2> (or a more specific closing heading): summarise the decision/next steps in ≤ ${CONCLUSION_WORDS} words with one clear call to action.`,
        'Return HTML only.',
      ]
        .filter(Boolean)
        .join('\n'),
    );

    const { text, usage } = await this.completeText(ctx, {
      system: this.systemPrompt(input),
      user,
      temperature: 0.6,
      maxTokens: maxTokensForWords(input.targetWords * 1.15),
      metadata: { mode: 'single', targetWords: input.targetWords },
    });
    return { html: text, calls: 1, usage };
  }

  // ── Sectioned ─────────────────────────────────────────────────────────────

  private async writeSectioned(input: WritingAgentInput, ctx: AgentContext) {
    const faqWords = input.seo.faqs.length * FAQ_ANSWER_WORDS;
    const bodyWords = Math.max(300, input.targetWords - INTRO_WORDS - CONCLUSION_WORDS - faqWords);
    const chunks = planChunks(input.seo.outline, bodyWords);
    const log = this.log(ctx);

    const parts: string[] = [];
    let usage: CompletionUsage | undefined;
    let calls = 0;
    const writtenHeadings: string[] = [];

    const system = this.systemPrompt(input);
    const context = this.contextBlocks(input);
    const fullOutline = this.block(
      'Full article outline (for context — write ONLY the requested part)',
      this.outlineText(input.seo.outline),
    );

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]!;
      const isFirst = i === 0;
      const previous = parts.length ? stripHtml(parts[parts.length - 1]!).slice(-900) : '';

      const user = this.assemble(
        ...context,
        fullOutline,
        this.block('Sections already written (do not repeat their content)', writtenHeadings),
        this.block(
          'Tail of the previous section (continue seamlessly, no recap)',
          previous || undefined,
        ),
        this.block(
          isFirst ? 'Write now: introduction + these sections' : 'Write now: these sections only',
          this.outlineText(chunk.sections),
        ),
        [
          isFirst
            ? `Start with the introduction (no heading, ~${INTRO_WORDS} words, includes the focus keyword in the first 100 words), then write the listed sections in order.`
            : 'Write the listed sections in order. Do not write an introduction, FAQ or conclusion.',
          `Target ~${chunk.words + (isFirst ? INTRO_WORDS : 0)} words for this part.`,
          'Return HTML only.',
        ].join('\n'),
      );

      const res = await this.completeText(ctx, {
        system,
        user,
        temperature: 0.6,
        maxTokens: maxTokensForWords(chunk.words + (isFirst ? INTRO_WORDS : 0)),
        metadata: { mode: 'sectioned', part: i + 1, of: chunks.length + 1 },
      });
      calls += 1;
      usage = usage ? sumUsage(usage, res.usage) : res.usage;
      parts.push(normalizeHtmlBody(res.text));
      writtenHeadings.push(...chunk.sections.map((s) => s.h2));
      log.debug({ part: i + 1, of: chunks.length + 1 }, 'Section chunk written');
    }

    // Final call: FAQ + conclusion.
    const closingUser = this.assemble(
      ...context,
      fullOutline,
      this.block('Sections already written', writtenHeadings),
      this.block('Tail of the previous section', stripHtml(parts[parts.length - 1]!).slice(-900)),
      this.block('FAQ questions', this.faqText(input)),
      [
        'Write now, in this order:',
        input.seo.faqs.length
          ? `1. <h2>Frequently Asked Questions</h2> with each question as an <h3> and a ${FAQ_ANSWER_WORDS}-word answer paragraph (direct answer in the first sentence).`
          : '',
        `${input.seo.faqs.length ? 2 : 1}. <h2>Conclusion</h2> (or a more specific closing heading): ≤ ${CONCLUSION_WORDS} words, include the focus keyword once, end with one clear call to action.`,
        'Return HTML only.',
      ]
        .filter(Boolean)
        .join('\n'),
    );
    const closing = await this.completeText(ctx, {
      system,
      user: closingUser,
      temperature: 0.5,
      maxTokens: maxTokensForWords(faqWords + CONCLUSION_WORDS + 100),
      metadata: { mode: 'sectioned', part: chunks.length + 1, of: chunks.length + 1 },
    });
    calls += 1;
    usage = usage ? sumUsage(usage, closing.usage) : closing.usage;
    parts.push(normalizeHtmlBody(closing.text));

    return { html: parts.join('\n\n'), calls, usage: usage! };
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
