import type { AIFeature } from '@acsp/database';
import type { ZodType, ZodTypeDef } from 'zod';
import { ZodError } from 'zod';
import {
  ai as defaultAi,
  AIClient,
  AIResponseError,
  type CompleteResult,
  type CompletionUsage,
} from '../lib/ai';
import { logger as rootLogger, type Logger } from '../lib/logger';

export interface AgentContext {
  companyId: string;
  userId?: string;
  jobId?: string;
  /** Model override (e.g. premium model for GROWTH/AGENCY plans). */
  model?: string;
  logger?: Logger;
}

export interface JsonCompletion<T> {
  data: T;
  usage: CompletionUsage;
  /** Number of model calls (1, or 2 when a repair round-trip was needed). */
  calls: number;
}

/**
 * Editorial rules shared by every agent. Appended to each system prompt so quality
 * expectations are consistent across the pipeline.
 */
export const EDITORIAL_RULES = `
Editorial rules (always apply):
- Demonstrate first-hand expertise and experience (E-E-A-T): concrete steps, trade-offs, examples, pitfalls.
- Never fabricate statistics, percentages, study results, quotes, prices, dates or named sources. If a claim would need data you do not have, state it qualitatively or tell the reader what to verify.
- No filler or clichés ("In today's fast-paced world", "It's no secret that", "Unlock the power of", "delve", "game-changer").
- Match every heading to the reader's search intent; headings must promise exactly what the section delivers.
- Prefer short sentences, plain words, active voice and specific nouns. One idea per paragraph.
- Write for the stated audience and in the requested language; keep brand voice consistent.`.trim();

export abstract class BaseAgent<TInput, TOutput> {
  abstract readonly name: string;
  abstract readonly feature: AIFeature;
  protected readonly ai: AIClient;
  private _logger?: Logger;

  constructor(ai: AIClient = defaultAi) {
    this.ai = ai;
  }

  protected get logger(): Logger {
    if (!this._logger) this._logger = rootLogger.child({ agent: this.name });
    return this._logger;
  }

  abstract run(input: TInput, ctx: AgentContext): Promise<TOutput>;

  protected log(ctx: AgentContext): Logger {
    return (ctx.logger ?? this.logger).child({ agent: this.name, jobId: ctx.jobId });
  }

  /**
   * Requests a JSON object and validates it with `schema`. If the model returns invalid JSON or
   * the schema rejects it, one repair attempt is made with the validation errors included.
   */
  protected async completeJson<T>(
    ctx: AgentContext,
    params: {
      schema: ZodType<T, ZodTypeDef, unknown>;
      system: string;
      user: string;
      temperature?: number;
      maxTokens?: number;
      metadata?: Record<string, unknown>;
    },
  ): Promise<JsonCompletion<T>> {
    const base = {
      feature: this.feature,
      companyId: ctx.companyId,
      userId: ctx.userId,
      jobId: ctx.jobId,
      model: ctx.model,
      json: true as const,
      temperature: params.temperature,
      maxTokens: params.maxTokens,
      metadata: { agent: this.name, ...(params.metadata ?? {}) },
    };

    const first = await this.ai.complete<unknown>({
      ...base,
      system: params.system,
      user: params.user,
    });
    const firstParse = params.schema.safeParse(first.parsed);
    if (firstParse.success) return { data: firstParse.data, usage: first.usage, calls: 1 };

    const problems = formatZodError(firstParse.error);
    this.log(ctx).warn({ problems }, 'Agent output failed validation; requesting a repair');

    const repairUser = [
      params.user,
      '',
      '--- PREVIOUS ATTEMPT (INVALID) ---',
      truncate(first.text, 12_000),
      '',
      '--- VALIDATION ERRORS ---',
      problems,
      '',
      'Return the corrected JSON object only. Fix every listed error and keep all valid content.',
    ].join('\n');

    let second: CompleteResult<unknown>;
    try {
      second = await this.ai.complete<unknown>({
        ...base,
        system: params.system,
        user: repairUser,
        metadata: { ...base.metadata, repair: true },
      });
    } catch (err) {
      if (err instanceof AIResponseError) {
        throw new AIResponseError(`${this.name}: model returned invalid JSON twice`, err.raw);
      }
      throw err;
    }
    const secondParse = params.schema.safeParse(second.parsed);
    if (!secondParse.success) {
      throw new AIResponseError(
        `${this.name}: output did not match the expected schema after repair: ${formatZodError(secondParse.error)}`,
        second.text,
      );
    }
    return {
      data: secondParse.data,
      usage: sumUsage(first.usage, second.usage),
      calls: 2,
    };
  }

  protected async completeText(
    ctx: AgentContext,
    params: {
      system: string;
      user: string;
      temperature?: number;
      maxTokens?: number;
      metadata?: Record<string, unknown>;
    },
  ): Promise<{ text: string; usage: CompletionUsage }> {
    const result = await this.ai.complete({
      feature: this.feature,
      companyId: ctx.companyId,
      userId: ctx.userId,
      jobId: ctx.jobId,
      model: ctx.model,
      system: params.system,
      user: params.user,
      temperature: params.temperature,
      maxTokens: params.maxTokens,
      metadata: { agent: this.name, ...(params.metadata ?? {}) },
    });
    return { text: result.text, usage: result.usage };
  }

  // ── Prompt helpers ──────────────────────────────────────────────────────────

  /** Describes the exact JSON contract the model must return. */
  protected jsonContract(shape: string, notes: string[] = []): string {
    return [
      'Respond with ONE JSON object only — no prose, no markdown fences.',
      'It must match this shape exactly (types in <angle brackets>, arrays may have any length unless stated):',
      shape.trim(),
      ...notes.map((n) => `- ${n}`),
    ].join('\n');
  }

  /** A titled prompt block; skipped entirely when the body is empty. */
  protected block(title: string, body: unknown): string {
    if (body === undefined || body === null) return '';
    const text =
      typeof body === 'string'
        ? body.trim()
        : Array.isArray(body)
          ? body.map((b) => `- ${String(b)}`).join('\n')
          : JSON.stringify(body, null, 2);
    if (!text || text === '{}' || text === '[]') return '';
    return `### ${title}\n${truncate(text, 6_000)}`;
  }

  protected assemble(...blocks: string[]): string {
    return blocks.filter((b) => b && b.trim().length > 0).join('\n\n');
  }
}

export function truncate(text: string, maxChars: number): string {
  return text.length > maxChars ? `${text.slice(0, maxChars)}\n…[truncated]` : text;
}

export function sumUsage(a: CompletionUsage, b: CompletionUsage): CompletionUsage {
  return {
    model: b.model || a.model,
    promptTokens: a.promptTokens + b.promptTokens,
    completionTokens: a.completionTokens + b.completionTokens,
    totalTokens: a.totalTokens + b.totalTokens,
    estimatedCostUsd: Math.round((a.estimatedCostUsd + b.estimatedCostUsd) * 1e6) / 1e6,
    durationMs: a.durationMs + b.durationMs,
  };
}

export function formatZodError(error: ZodError): string {
  return error.issues
    .slice(0, 12)
    .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('; ');
}
