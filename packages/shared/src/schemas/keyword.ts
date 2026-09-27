import { z } from 'zod';
import { KeywordStatuses, SearchIntents } from '../enums';

export const keywordResearchRequestSchema = z.object({
  topic: z.string().trim().min(2).max(200),
  seedKeywords: z.array(z.string().trim().min(1).max(100)).max(20).optional(),
  country: z.string().max(2).default('US'),
  language: z.string().max(10).default('en'),
});
export type KeywordResearchRequest = z.infer<typeof keywordResearchRequestSchema>;

export const createKeywordSchema = z.object({
  term: z.string().trim().min(1).max(150),
  volume: z.number().int().min(0).optional(),
  difficulty: z.number().int().min(0).max(100).optional(),
  intent: z.enum(SearchIntents).optional(),
  clusterId: z.string().optional(),
});

export const updateKeywordSchema = createKeywordSchema.partial().extend({
  status: z.enum(KeywordStatuses).optional(),
});
