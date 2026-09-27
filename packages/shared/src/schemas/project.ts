import { z } from 'zod';
import { ProjectStatuses } from '../enums';

export const createProjectSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(2000).optional(),
  topic: z.string().trim().max(200).optional(),
  websiteId: z.string().min(1).optional(),
  goals: z.record(z.unknown()).optional(),
});
export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const updateProjectSchema = createProjectSchema.partial().extend({
  status: z.enum(ProjectStatuses).optional(),
});
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
