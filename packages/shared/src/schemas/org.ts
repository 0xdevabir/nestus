import { z } from 'zod';
import { Role } from '../enums';
import { paginationQuery } from './pagination';

export const createOrgSchema = z.object({
  name: z.string().trim().min(1).max(100),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase kebab-case')
    .optional(),
});

export type CreateOrgInput = z.infer<typeof createOrgSchema>;

export const updateOrgSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase kebab-case')
    .optional(),
  autonomyMode: z.enum(['OFF', 'SUGGEST', 'AUTO']).optional(),
});

export type UpdateOrgInput = z.infer<typeof updateOrgSchema>;

export const updateMemberSchema = z.object({
  role: z.nativeEnum(Role),
});

export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;

export const createInvitationSchema = z.object({
  email: z.string().trim().email().max(320),
  role: z.nativeEnum(Role),
});

export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;

export const createApiKeySchema = z.object({
  name: z.string().trim().min(1).max(100),
  permissions: z.array(z.string()).min(1).optional(),
  expiresAt: z.coerce.date().optional(),
});

export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;

export const auditLogQuerySchema = paginationQuery.extend({
  actorType: z.string().optional(),
  action: z.string().optional(),
  targetType: z.string().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;
