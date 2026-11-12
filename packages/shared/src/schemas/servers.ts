import { z } from 'zod';
import { paginationQuery } from './pagination';
import { ServerStatus } from '../enums';

export const createServerSchema = z.object({
  name: z.string().trim().min(1).max(100),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
});

export type CreateServerInput = z.infer<typeof createServerSchema>;

export const updateServerSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
});

export type UpdateServerInput = z.infer<typeof updateServerSchema>;

export const listServersQuerySchema = paginationQuery.extend({
  status: z.nativeEnum(ServerStatus).optional(),
  tag: z.string().trim().min(1).optional(),
  q: z.string().trim().min(1).optional(),
});

export type ListServersQuery = z.infer<typeof listServersQuerySchema>;

export const dispatchCommandSchema = z.object({
  type: z.string().min(1),
  params: z.record(z.unknown()).default({}),
  wait: z.boolean().optional(),
  timeoutSec: z.number().int().positive().max(600).optional(),
});

export type DispatchCommandInput = z.infer<typeof dispatchCommandSchema>;
