import type { Permission } from '@nestus/shared';
import type { ActorType } from '@prisma/client';

export type RequestActor = {
  type: ActorType;
  id: string;
  label: string;
};

export type RequestContext = {
  orgId: string;
  actor: RequestActor;
  permissions: Permission[];
};

export type AuthUser = {
  id: string;
  email: string;
};

export type AuthApiKey = {
  id: string;
  orgId: string;
  name: string;
  permissions: Permission[];
};
