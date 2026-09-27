import { AIFeature } from '@acsp/database';
import {
  analyzeSeo,
  countWords,
  splitSentences,
  stripHtml,
  type SeoAnalysisResult,
} from '@acsp/shared';
import { z } from 'zod';
import type { CompletionUsage } from '../lib/ai';
import { normalizeHtmlBody } from '../lib/text';
import { BaseAgent, EDITORIAL_RULES, sumUsage, truncate, type AgentContext } from './base-agent';

export interface QualityAgentInput {
  html: string;
  keyword: string;
  secondaryKeywords?: string[];
  title: string;
  metaTitle?: string | null;
  metaDescription?: string | null;
  audience?: string | null;
  tone?: string | null;
  brandVoice?: string | null;
  targetWords: number;
  /** Expected H2 headings (from the SEO structure) used to judge completeness. */
  expectedHeadings?: string[];
  questions?: string[];
  language?: string;
  siteDomain?: string | null;
  /** Below this final score a revision is produced (default 75). */
  threshold?: number;
  /** Set false to skip the revision call even when the score is low. */
  allowRevision?: boolean;
}

const dimension = z.object({
  score: z.coerce.number().min(0).max(100).catch(50),
  notes: z.string().max(600).catch(''),
});

export const qualityReportSchema = z.object({
  score: z.coerce.number().min(0).max(100),
  readability: dimension,
  keywordUsage: dimension,
  repetition: dimension,
  completeness: dimension,
  accuracy: dimension.optional().catch(undefined),
  issues: z
    .array(
      z.object({
        severity: z.enum(['low', 'medium', 'high']).catch('medium'),
        location: z.string().max(200).catch(''),
        issue: z.string().min(1).max(500),
      }),
    )
    .catch([]),
  fixes: z.array(z.string().min(1).max(500)).catch([]),
});

export type QualityReport = z.infer<typeof qualityReportSchema>;

export interface QualityAgentOutput extends QualityReport {
  /** Blend of the model's judgement and the deterministic SEO heuristics. */
  finalScore: number;
  aiScore: number;
  heuristics: SeoAnalysisResult;
  revised: boolean;
  revisedHtml?: string;
  revisedHeuristics?: SeoAnalysisResult;
  calls: number;
  usage: CompletionUsage;
}

export interface RepetitionStats {
  duplicateSentences: string[];
  repeatedPhrases: { phrase: string; count: number }[];
  sentenceCount: number;
}

/** Deterministic repetition heuristics: duplicated sentences and over-used 4-grams. */
export function repetitionStats(text: string): RepetitionStats {
  const sentences = splitSentences(text);
  const seen = new Map<string, number>();
  for (const s of sentences) {
    const key = s
      .toLowerCase()
      .replace(/[^\p{L}\p{N} ]/gu, '')
      .trim();
    if (key.split(' ').length < 5) continue;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  const duplicateSentences = [...seen.entries()]
    .filter(([, n]) => n > 1)
    .map(([s]) => s)
    .slice(0, 10);

  const words = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N} ]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const grams = new Map<string, number>();
  for (let i = 0; i + 4 <= words.length; i++) {
    const g = words.slice(i, i + 4).join(' ');
    grams.set(g, (grams.get(g) ?? 0) + 1);
  }
  const repeatedPhrases = [...grams.entries()]
    .filter(([, n]) => n >= 4)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([phrase, count]) => ({ phrase, count }));

  return { duplicateSentences, repeatedPhrases, sentenceCount: sentences.length };
}

/**
 * Quality Agent — validates a draft for readability, keyword usage, repetition, completeness and
 * factual hygiene. Deterministic heuristics (`analyzeSeo`, repetition stats) are fed to the model so
 * it reasons over real numbers instead of guessing. When the blended score is below the threshold,
 * a single revision pass rewrites the draft to fix the listed issues.
 */
export class QualityAgent extends BaseAgent<QualityAgentInput, QualityAgentOutput> {
  readonly name = 'quality-agent';
  readonly feature = AIFeature.QUALITY_CHECK;

  async run(input: QualityAgentInput, ctx: AgentContext): Promise<QualityAgentOutput> {
    const threshold = input.threshold ?? 75;
    const heuristics = this.heuristics(input.html, input);
    const text = stripHtml(input.html);
    const repetition = repetitionStats(text);
    const wordCount = countWords(text);
    const log = this.log(ctx);

    const review = await this.completeJson(ctx, {
      schema: qualityReportSchema,
      system: this.reviewSystem(input),
      user: this.assemble(
        this.block('Focus keyword', input.keyword),
        this.block('Secondary keywords', input.secondaryKeywords ?? []),
        this.block('Title / meta', {
          title: input.title,
          metaTitle: input.metaTitle ?? null,
          metaDescription: input.metaDescription ?? null,
        }),
        this.block('Audience', input.audience ?? undefined),
        this.block(
          'Tone / brand voice',
          [input.tone, input.brandVoice].filter(Boolean).join(' — ') || undefined,
        ),
        this.block('Target length', `${input.targetWords} words (actual: ${wordCount})`),
        this.block('Required H2 sections', input.expectedHeadings ?? []),
        this.block('Questions the article must answer', input.questions ?? []),
        this.block(
          'Deterministic SEO checks that FAILED',
          heuristics.checks.filter((c) => !c.passed).map((c) => `${c.label}: ${c.message}`),
        ),
        this.block('Measured stats', {
          wordCount,
          fleschReadingEase: heuristics.readability.fleschReadingEase,
          avgWordsPerSentence: heuristics.readability.avgWordsPerSentence,
          passiveSentenceRatio: heuristics.readability.passiveSentenceRatio,
          keywordDensityPct: heuristics.stats.keywordDensity,
          keywordOccurrences: heuristics.stats.keywordOccurrences,
          h2Count: heuristics.stats.h2Count,
          longestParagraphWords: heuristics.stats.longestParagraphWords,
          duplicateSentences: repetition.duplicateSentences,
          repeatedPhrases: repetition.repeatedPhrases,
        }),
        this.block('Draft HTML', truncate(input.html, 60_000)),
        this.jsonContract(`{
  "score": <number 0-100 overall publish-readiness>,
  "readability": { "score": <0-100>, "notes": "<string>" },
  "keywordUsage": { "score": <0-100>, "notes": "<string>" },
  "repetition": { "score": <0-100>, "notes": "<string>" },
  "completeness": { "score": <0-100>, "notes": "<string>" },
  "accuracy": { "score": <0-100>, "notes": "<string: unverifiable or suspicious claims>" },
  "issues": [ { "severity": "<low|medium|high>", "location": "<heading or quoted phrase>", "issue": "<string>" } ],
  "fixes": [ "<concrete, actionable instruction an editor can apply>" ]
}`),
      ),
      temperature: 0.2,
      maxTokens: 3_000,
      metadata: { stage: 'review' },
    });

    const aiScore = Math.round(review.data.score);
    const finalScore = Math.round(aiScore * 0.6 + heuristics.score * 0.4);
    let usage = review.usage;
    let calls = review.calls;

    const output: QualityAgentOutput = {
      ...review.data,
      score: finalScore,
      finalScore,
      aiScore,
      heuristics,
      revised: false,
      calls,
      usage,
    };

    log.info(
      {
        aiScore,
        seoScore: heuristics.score,
        finalScore,
        issues: review.data.issues.length,
        threshold,
      },
      'Quality review complete',
    );

    if (finalScore >= threshold || input.allowRevision === false) return output;

    // ── One revision pass ──
    const revision = await this.completeText(ctx, {
      system: this.reviseSystem(input),
      user: this.assemble(
        this.block('Focus keyword', input.keyword),
        this.block('Secondary keywords', input.secondaryKeywords ?? []),
        this.block('Required H2 sections (keep wording)', input.expectedHeadings ?? []),
        this.block('Target length', `${input.targetWords} words (±10%)`),
        this.block(
          'Issues found',
          review.data.issues.map(
            (i) => `[${i.severity}] ${i.location ? `${i.location}: ` : ''}${i.issue}`,
          ),
        ),
        this.block('Fixes to apply', review.data.fixes),
        this.block('Failed SEO checks to resolve', heuristics.suggestions),
        this.block('Draft HTML to revise', truncate(input.html, 60_000)),
        'Return the complete revised article as HTML only.',
      ),
      temperature: 0.4,
      maxTokens: Math.min(16_000, Math.round(input.targetWords * 2.2) + 800),
      metadata: { stage: 'revise' },
    });
    calls += 1;
    usage = sumUsage(usage, revision.usage);

    let revisedHtml = normalizeHtmlBody(revision.text).replace(
      /<h1\b[^>]*>[\s\S]*?<\/h1>\s*/gi,
      '',
    );
    const h1 = /<h1\b[^>]*>[\s\S]*?<\/h1>/i.exec(input.html)?.[0];
    if (h1) revisedHtml = `${h1}\n${revisedHtml}`;

    const revisedHeuristics = this.heuristics(revisedHtml, input);
    const revisedWords = countWords(stripHtml(revisedHtml));
    // Reject revisions that collapsed the article (model truncated or summarised).
    const acceptable =
      revisedWords >= Math.min(wordCount, input.targetWords) * 0.7 &&
      revisedHeuristics.stats.h2Count >= Math.max(2, heuristics.stats.h2Count - 1);

    if (!acceptable) {
      log.warn(
        { revisedWords, wordCount, h2: revisedHeuristics.stats.h2Count },
        'Revision rejected (too short or lost sections)',
      );
      return { ...output, calls, usage };
    }

    log.info(
      { seoScoreBefore: heuristics.score, seoScoreAfter: revisedHeuristics.score },
      'Revision applied',
    );
    return { ...output, revised: true, revisedHtml, revisedHeuristics, calls, usage };
  }

  private heuristics(html: string, input: QualityAgentInput): SeoAnalysisResult {
    return analyzeSeo({
      html,
      keyword: input.keyword,
      metaTitle: input.metaTitle ?? input.title,
      metaDescription: input.metaDescription ?? undefined,
      secondaryKeywords: input.secondaryKeywords,
      siteDomain: input.siteDomain ?? undefined,
    });
  }

  private reviewSystem(input: QualityAgentInput): string {
    return `You are a demanding managing editor and SEO lead reviewing a draft before publication. You are precise, evidence-based and you cite the exact heading or sentence when you flag a problem.

${EDITORIAL_RULES}

Scoring guidance (0-100 per dimension; overall "score" is your publish-readiness judgement, not an average):
- readability: sentence length variety, plain words, paragraph size, scannability, ${input.language ?? 'en'} grammar.
- keywordUsage: natural use of the focus keyword in intro/headings/body/conclusion; secondary keywords covered; no stuffing (measured density is provided — trust it).
- repetition: repeated ideas, sentences, phrases, redundant sections, filler transitions (measured duplicates are provided).
- completeness: every required H2 present with substance; every listed question answered; intent fully satisfied; no thin sections; length within ±15% of target.
- accuracy: any statistics, quotes, named studies, prices or dates that cannot be verified from general knowledge — flag them as issues with severity "high".
- Deduct heavily for fabricated data, missing required sections, off-intent headings and AI clichés.
- "fixes" must be concrete edit instructions ("Merge the two paragraphs under 'X' and add a numbered checklist", not "improve flow").`;
  }

  private reviseSystem(input: QualityAgentInput): string {
    return `You are a senior editor revising an article in place. Apply every listed fix and resolve every failed SEO check while preserving everything that already works.

${EDITORIAL_RULES}

Revision rules:
- Keep the required H2 headings and their order; you may refine H3s and paragraphs freely.
- Keep total length within ±10% of the target; do not summarise or drop sections.
- Remove or qualify any unverifiable statistic, quote, study or named source. Do not add new ones.
- Keep the focus keyword in the first 100 words, in at least one H2, and in the conclusion; density 1–2%.
- Output HTML only using <h2>, <h3>, <p>, <ul>, <ol>, <li>, <strong>, <em>, <a>, <blockquote>, <table>. No <h1>, no markdown, no commentary.
- Language: ${input.language ?? 'en'}.${input.brandVoice ? ` Brand voice: ${input.brandVoice}.` : ''}${input.tone ? ` Tone: ${input.tone}.` : ''}`;
  }
}
