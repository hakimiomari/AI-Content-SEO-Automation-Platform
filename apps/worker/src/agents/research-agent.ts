import { AIFeature } from '@acsp/database';
import { SearchIntents, type SearchIntent } from '@acsp/shared';
import { z } from 'zod';
import { BaseAgent, EDITORIAL_RULES, type AgentContext } from './base-agent';

export interface ResearchAgentInput {
  topic: string;
  seedKeywords?: string[];
  /** Website.businessProfile JSON (audience, products, USPs, competitors, tone). */
  businessProfile?: unknown;
  brandVoice?: string | null;
  websiteDomain?: string | null;
  country?: string;
  language?: string;
  /** Terms already tracked in the project; the agent must not repeat them. */
  existingKeywords?: string[];
  maxClusters?: number;
  maxKeywordsPerCluster?: number;
}

export function normalizeTerm(term: string): string {
  return term.toLowerCase().replace(/[“”"]/g, '').replace(/\s+/g, ' ').trim();
}

const intentSchema = z
  .string()
  .transform((s) => s.toUpperCase().trim())
  .pipe(z.enum(SearchIntents))
  .catch('INFORMATIONAL' as SearchIntent);

export const researchKeywordSchema = z.object({
  term: z.string().min(1).max(150).transform(normalizeTerm),
  estimatedVolume: z.coerce.number().int().min(0).max(50_000_000).catch(0),
  estimatedDifficulty: z.coerce.number().int().min(0).max(100).catch(50),
  intent: intentSchema,
  opportunity: z.coerce.number().int().min(0).max(100).catch(50),
  rationale: z.string().max(400).catch(''),
});

export const researchClusterSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional().catch(undefined),
  intent: intentSchema.nullable().catch(null),
  pillar: z.coerce.boolean().catch(false),
  keywords: z.array(researchKeywordSchema).min(1),
});

export const researchOutputSchema = z.object({
  summary: z.string().max(1_000).optional().catch(undefined),
  clusters: z.array(researchClusterSchema).min(1),
});

export type ResearchKeyword = z.infer<typeof researchKeywordSchema>;
export type ResearchCluster = z.infer<typeof researchClusterSchema>;
export type ResearchAgentOutput = z.infer<typeof researchOutputSchema> & { calls: number };

/**
 * Research Agent — discovers keyword opportunities grouped into topic clusters with intent,
 * estimated volume/difficulty and an opportunity score. All numbers are model estimates and are
 * labelled as such downstream (`source: 'ai'`).
 */
export class ResearchAgent extends BaseAgent<ResearchAgentInput, ResearchAgentOutput> {
  readonly name = 'research-agent';
  readonly feature = AIFeature.KEYWORD_RESEARCH;

  async run(input: ResearchAgentInput, ctx: AgentContext): Promise<ResearchAgentOutput> {
    const maxClusters = input.maxClusters ?? 6;
    const maxPerCluster = input.maxKeywordsPerCluster ?? 10;
    const country = input.country ?? 'US';
    const language = input.language ?? 'en';

    const system = `You are a senior SEO strategist who has built topical maps for hundreds of websites. You think in topic clusters (one pillar page supported by focused articles), you judge search intent precisely, and you are honest that volume and difficulty figures are estimates.

${EDITORIAL_RULES}

Research rules:
- Group keywords into ${Math.max(3, Math.min(maxClusters, 12))} clusters max, each a coherent sub-topic with a dominant intent. Mark 1–2 clusters as pillar=true (broad, high-value hub topics).
- 4–${maxPerCluster} keywords per cluster. Mix head terms, mid-tail and long-tail (question) queries.
- estimatedVolume: monthly searches for ${country}/${language}, rounded to a plausible bucket (10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000…). Never claim false precision.
- estimatedDifficulty: 0–100 ranking difficulty (0 = trivial, 100 = dominated by major brands).
- opportunity: 0–100 combining realistic volume, achievable difficulty for a small/medium site and fit with the business. Low fit → low opportunity even if volume is high.
- intent: INFORMATIONAL, NAVIGATIONAL, COMMERCIAL or TRANSACTIONAL.
- rationale: one sentence (≤140 chars) saying why this keyword is worth pursuing or what content would win it.
- Exclude competitor brand names, trademark-only navigational queries, and anything already tracked.
- Keywords must be in language "${language}" and phrased the way people actually search (lowercase, no punctuation).`;

    const user = this.assemble(
      this.block('Topic', input.topic),
      this.block('Seed keywords', input.seedKeywords ?? []),
      this.block('Website', input.websiteDomain ?? undefined),
      this.block('Business profile', input.businessProfile),
      this.block('Brand voice', input.brandVoice ?? undefined),
      this.block(
        'Already tracked keywords (do not repeat)',
        (input.existingKeywords ?? []).slice(0, 150),
      ),
      this.jsonContract(
        `{
  "summary": "<string: 2-3 sentences on the topical map and where to start>",
  "clusters": [
    {
      "name": "<string>",
      "description": "<string: what this cluster covers>",
      "intent": "<INFORMATIONAL|NAVIGATIONAL|COMMERCIAL|TRANSACTIONAL>",
      "pillar": <boolean>,
      "keywords": [
        {
          "term": "<string>",
          "estimatedVolume": <integer>,
          "estimatedDifficulty": <integer 0-100>,
          "intent": "<INFORMATIONAL|NAVIGATIONAL|COMMERCIAL|TRANSACTIONAL>",
          "opportunity": <integer 0-100>,
          "rationale": "<string ≤140 chars>"
        }
      ]
    }
  ]
}`,
        ['Every term must be unique across all clusters.'],
      ),
    );

    const { data, calls } = await this.completeJson(ctx, {
      schema: researchOutputSchema,
      system,
      user,
      temperature: 0.5,
      maxTokens: 6_000,
      metadata: { topic: input.topic },
    });

    // De-duplicate terms across clusters and drop already-tracked terms defensively.
    const seen = new Set((input.existingKeywords ?? []).map(normalizeTerm));
    const clusters = data.clusters
      .slice(0, maxClusters)
      .map((cluster) => ({
        ...cluster,
        keywords: cluster.keywords
          .filter((k) => {
            if (!k.term || seen.has(k.term)) return false;
            seen.add(k.term);
            return true;
          })
          .slice(0, maxPerCluster),
      }))
      .filter((c) => c.keywords.length > 0);

    this.log(ctx).info(
      { clusters: clusters.length, keywords: clusters.reduce((n, c) => n + c.keywords.length, 0) },
      'Research complete',
    );

    return { summary: data.summary, clusters, calls };
  }
}
