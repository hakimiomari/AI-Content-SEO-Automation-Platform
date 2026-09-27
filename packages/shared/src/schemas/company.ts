import { z } from 'zod';
import { Roles } from '../enums';
import { slugSchema } from './common';

export const updateCompanySchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  slug: slugSchema.optional(),
  industry: z.string().trim().max(80).optional(),
  description: z.string().trim().max(2000).optional(),
  timezone: z.string().max(64).optional(),
  locale: z.string().max(10).optional(),
  logoUrl: z.string().url().optional().nullable(),
});
export type UpdateCompanyInput = z.infer<typeof updateCompanySchema>;

export const inviteUserSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  role: z.enum(Roles).exclude(['SUPER_ADMIN']).default('COMPANY_USER'),
});
export type InviteUserInput = z.infer<typeof inviteUserSchema>;

export const updateUserSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  avatarUrl: z.string().url().optional().nullable(),
  role: z.enum(Roles).exclude(['SUPER_ADMIN']).optional(),
  isActive: z.boolean().optional(),
});
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
