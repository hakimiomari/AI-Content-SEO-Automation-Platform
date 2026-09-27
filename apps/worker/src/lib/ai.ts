import OpenAI from 'openai';
import { UnrecoverableError } from 'bullmq';
import { Prisma, type AIFeature, type Plan, type PrismaClient } from '@acsp/database';
import { config } from '../config';
import { logger, type Logger } from './logger';
import { prisma as defaultPrisma, toJson } from './prisma';
import { recordUsage } from './usage-guard';

/** USD per 1M tokens. Update when OpenAI changes prices. */
export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'gpt-4o': { input: 2.5, output: 10 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4.1': { input: 2, output: 8 },
  'gpt-4.1-mini': { input: 0.4, output: 1.6 },
  'o3-mini': { input: 1.1, output: 4.4 },
};
export const FALLBACK_PRICING = { input: 1, output: 4 };

export function estimateCostUsd(
  model: string,
  promptTokens: number,
  completionTokens: number,
): number {
  const base = model.toLowerCase();
  const key = Object.keys(MODEL_PRICING).find((k) => base === k || base.startsWith(`${k}-`));
  const pricing = key ? MODEL_PRICING[key]! : FALLBACK_PRICING;
  const cost = (promptTokens * pricing.input + completionTokens * pricing.output) / 1_000_000;
  return Math.round(cost * 1_000_000) / 1_000_000;
}

/** Premium plans get the premium model; everyone else the default model. */
export function chooseModel(plan: Plan | string | null | undefined): string {
  return plan === 'GROWTH' || plan === 'AGENCY' ? config.OPENAI_MODEL_PREMIUM : config.OPENAI_MODEL;
}

export class AIConfigurationError extends UnrecoverableError {
  constructor(
    message = 'OPENAI_API_KEY is not configured. Set it in the root .env to enable AI features.',
  ) {
    super(message);
    this.name = 'AIConfigurationError';
  }
}

export class AIResponseError extends Error {
  constructor(
    message: string,
    public readonly raw: string,
  ) {
    super(message);
    this.name = 'AIResponseError';
  }
}

export interface CompleteOptions {
  feature: AIFeature;
  companyId: string;
  userId?: string;
  jobId?: string;
  model?: string;
  system: string;
  user: string;
  /** Request `response_format: json_object` and JSON.parse the reply into `parsed`. */
  json?: boolean;
  temperature?: number;
  maxTokens?: number;
  metadata?: Record<string, unknown>;
}

export interface CompletionUsage {
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  durationMs: number;
}

export interface CompleteResult<T = unknown> {
  text: string;
  parsed?: T;
  usage: CompletionUsage;
}

/** Removes ```json fences the model sometimes adds even in JSON mode. */
export function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  const fence = /^```[a-zA-Z0-9_-]*\s*\n?([\s\S]*?)\n?```$/.exec(trimmed);
  return fence ? fence[1]!.trim() : trimmed;
}

export function parseJsonLoose<T = unknown>(text: string): T {
  const cleaned = stripCodeFences(text);
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // Fall back to the outermost {...} or [...] block.
    const start = Math.min(...['{', '['].map((c) => cleaned.indexOf(c)).filter((i) => i >= 0));
    const end = Math.max(cleaned.lastIndexOf('}'), cleaned.lastIndexOf(']'));
    if (Number.isFinite(start) && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1)) as T;
    }
    throw new AIResponseError('Model did not return valid JSON', text);
  }
}

function isReasoningModel(model: string): boolean {
  return /^o\d/i.test(model);
}

/**
 * Thin wrapper around the OpenAI SDK that records every call as an `AIUsage` row and
 * increments the tenant's AI-credit counter (1 credit per completion).
 */
export class AIClient {
  private readonly client: OpenAI | null;
  private readonly log: Logger;

  constructor(
    private readonly prisma: PrismaClient = defaultPrisma,
    apiKey: string | undefined = config.OPENAI_API_KEY,
    log: Logger = logger,
  ) {
    this.client = apiKey ? new OpenAI({ apiKey, maxRetries: 2, timeout: 180_000 }) : null;
    this.log = log.child({ module: 'ai' });
  }

  get isConfigured(): boolean {
    return this.client !== null;
  }

  async complete<T = unknown>(opts: CompleteOptions): Promise<CompleteResult<T>> {
    if (!this.client) throw new AIConfigurationError();

    const model = opts.model ?? config.OPENAI_MODEL;
    const startedAt = Date.now();
    const reasoning = isReasoningModel(model);

    const response = await this.client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: opts.system },
        { role: 'user', content: opts.user },
      ],
      ...(reasoning ? {} : { temperature: opts.temperature ?? 0.4 }),
      ...(opts.maxTokens ? { max_completion_tokens: opts.maxTokens } : {}),
      ...(opts.json ? { response_format: { type: 'json_object' as const } } : {}),
    });

    const durationMs = Date.now() - startedAt;
    const choice = response.choices[0];
    const text = choice?.message?.content ?? '';
    const promptTokens = response.usage?.prompt_tokens ?? 0;
    const completionTokens = response.usage?.completion_tokens ?? 0;
    const totalTokens = response.usage?.total_tokens ?? promptTokens + completionTokens;
    const usedModel = response.model || model;
    const estimatedCostUsd = estimateCostUsd(usedModel, promptTokens, completionTokens);

    const usage: CompletionUsage = {
      model: usedModel,
      promptTokens,
      completionTokens,
      totalTokens,
      estimatedCostUsd,
      durationMs,
    };

    await this.record(opts, usage, {
      finishReason: choice?.finish_reason ?? null,
      json: Boolean(opts.json),
    });

    this.log.debug(
      { feature: opts.feature, model: usedModel, totalTokens, durationMs, jobId: opts.jobId },
      'AI completion',
    );

    if (choice?.finish_reason === 'length') {
      this.log.warn(
        { feature: opts.feature, model: usedModel, jobId: opts.jobId },
        'AI completion was truncated (finish_reason=length)',
      );
    }

    let parsed: T | undefined;
    if (opts.json) {
      parsed = parseJsonLoose<T>(text);
    }
    return { text, parsed, usage };
  }

  private async record(
    opts: CompleteOptions,
    usage: CompletionUsage,
    extra: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.prisma.aIUsage.create({
        data: {
          companyId: opts.companyId,
          userId: opts.userId ?? null,
          feature: opts.feature,
          model: usage.model,
          promptTokens: usage.promptTokens,
          completionTokens: usage.completionTokens,
          totalTokens: usage.totalTokens,
          estimatedCostUsd: new Prisma.Decimal(usage.estimatedCostUsd.toFixed(6)),
          durationMs: usage.durationMs,
          jobId: opts.jobId ?? null,
          metadata: toJson({ ...(opts.metadata ?? {}), ...extra }),
        },
      });
      await recordUsage(opts.companyId, { aiCredits: 1 });
    } catch (err) {
      // Never fail the job because bookkeeping failed; log loudly instead.
      this.log.error(
        { err, companyId: opts.companyId, feature: opts.feature },
        'Failed to record AI usage',
      );
    }
  }
}

export const ai = new AIClient();
