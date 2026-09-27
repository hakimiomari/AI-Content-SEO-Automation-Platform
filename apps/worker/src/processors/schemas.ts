import { SocialPlatforms } from '@acsp/shared';
import { z } from 'zod';

export const baseJobSchema = z.object({
  companyId: z.string().min(1),
  userId: z.string().min(1).optional(),
  requestId: z.string().optional(),
});

export const keywordResearchJobSchema = baseJobSchema.extend({
  projectId: z.string().min(1),
  topic: z.string().trim().min(2).max(200),
  seedKeywords: z.array(z.string().trim().min(1).max(100)).max(30).optional(),
  country: z.string().max(2).optional(),
  language: z.string().max(10).optional(),
});

export const websiteAnalysisJobSchema = baseJobSchema.extend({
  websiteId: z.string().min(1),
});

export const contentGenerationJobSchema = baseJobSchema.extend({
  projectId: z.string().min(1),
  briefId: z.string().min(1),
  contentId: z.string().min(1).optional(),
});

export const seoAnalysisJobSchema = baseJobSchema.extend({
  contentId: z.string().min(1),
  keyword: z.string().trim().min(1).max(150).optional(),
});

export const repurposingJobSchema = baseJobSchema.extend({
  contentId: z.string().min(1),
  platforms: z
    .array(
      z
        .string()
        .transform((s) => s.toUpperCase().trim())
        .pipe(z.enum(SocialPlatforms)),
    )
    .min(1)
    .max(SocialPlatforms.length),
});

export const publishingJobSchema = baseJobSchema.extend({
  scheduleId: z.string().min(1),
});

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'Expected an ISO date (YYYY-MM-DD)');

export const analyticsSyncJobSchema = baseJobSchema.extend({
  websiteId: z.string().min(1),
  integrationId: z.string().min(1),
  from: isoDate.optional(),
  to: isoDate.optional(),
});

export const reportGenerationJobSchema = baseJobSchema.extend({
  projectId: z.string().min(1),
  from: isoDate,
  to: isoDate,
});
