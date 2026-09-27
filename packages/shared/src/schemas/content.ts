import { z } from 'zod';
import { AIEditorActions, ContentStatuses, ContentTypes, SocialPlatforms } from '../enums';

export const createBriefSchema = z.object({
  title: z.string().trim().min(3).max(200),
  contentType: z.enum(ContentTypes).default('BLOG_POST'),
  keywordId: z.string().optional(),
  clusterId: z.string().optional(),
  audience: z.string().max(500).optional(),
  tone: z.string().max(200).optional(),
  targetWords: z.number().int().min(200).max(10_000).default(1200),
  secondaryKeywords: z.array(z.string().max(100)).max(30).default([]),
  questions: z.array(z.string().max(200)).max(30).default([]),
  notes: z.string().max(5000).optional(),
});
export type CreateBriefInput = z.infer<typeof createBriefSchema>;

export const updateContentSchema = z.object({
  title: z.string().trim().min(3).max(200).optional(),
  slug: z.string().max(200).optional(),
  excerpt: z.string().max(500).optional(),
  metaTitle: z.string().max(70).optional(),
  metaDescription: z.string().max(170).optional(),
  status: z.enum(ContentStatuses).optional(),
  body: z.string().optional(),
  bodyJson: z.unknown().optional(),
});
export type UpdateContentInput = z.infer<typeof updateContentSchema>;

export const aiEditActionSchema = z.object({
  action: z.enum(AIEditorActions),
  selection: z.string().min(1).max(20_000),
  instructions: z.string().max(1000).optional(),
  targetLanguage: z.string().max(10).optional(),
});
export type AIEditActionInput = z.infer<typeof aiEditActionSchema>;

export const repurposeRequestSchema = z.object({
  platforms: z.array(z.enum(SocialPlatforms)).min(1),
});

export const scheduleSchema = z.object({
  scheduledFor: z.coerce.date(),
  integrationId: z.string().optional(),
});
