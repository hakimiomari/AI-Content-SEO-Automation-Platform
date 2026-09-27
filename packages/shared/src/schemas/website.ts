import { z } from 'zod';

export const businessProfileSchema = z.object({
  audience: z.string().max(500).optional(),
  products: z.array(z.string().max(120)).max(50).optional(),
  usps: z.array(z.string().max(200)).max(20).optional(),
  competitors: z.array(z.string().max(120)).max(20).optional(),
  tone: z.string().max(200).optional(),
});

export const createWebsiteSchema = z.object({
  name: z.string().trim().min(2).max(120),
  url: z.string().trim().url(),
  language: z.string().max(10).default('en'),
  country: z.string().max(2).default('US'),
  brandVoice: z.string().max(1000).optional(),
  businessProfile: businessProfileSchema.optional(),
});
export type CreateWebsiteInput = z.infer<typeof createWebsiteSchema>;

export const updateWebsiteSchema = createWebsiteSchema.partial();
export type UpdateWebsiteInput = z.infer<typeof updateWebsiteSchema>;
