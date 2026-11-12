import type {
  ActorType,
  CommandStatus,
  Role,
  ServerStatus,
} from '@nestus/shared';

export type { CommandStatus, ServerStatus };

export type User = {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string | null;
  createdAt?: string;
};

export type Organization = {
  id: string;
  name: string;
  slug: string;
  autonomyMode?: string;
  createdAt?: string;
};

export type Membership = {
  id: string;
  role: Role;
  orgId?: string;
  userId?: string;
  createdAt?: string;
  org?: Organization;
  user?: User;
};

export type AuthPayload = {
  accessToken: string;
  user: User;
  memberships: Membership[];
};

export type MeResponse = {
  user: User;
  memberships: Membership[];
};

export type Invitation = {
  id: string;
  orgId: string;
  email: string;
  role: Role;
  expiresAt: string;
  acceptedAt?: string | null;
  inviteUrl?: string;
};

export type ApiKey = {
  id: string;
  orgId: string;
  name: string;
  prefix: string;
  permissions: string[];
  lastUsedAt?: string | null;
  expiresAt?: string | null;
  revokedAt?: string | null;
  createdAt: string;
};

export type ApiKeyCreated = ApiKey & { key: string };

export type AuditLog = {
  id: string;
  orgId?: string | null;
  actorType: ActorType;
  actorId?: string | null;
  actorLabel?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: unknown;
  ip?: string | null;
  createdAt: string;
};

export type CursorPage<T> = {
  data: T[];
  nextCursor?: string | null;
};

/** BigInt fields often serialize as strings over JSON. */
export type ByteCount = string | number | null;

export type Server = {
  id: string;
  orgId: string;
  name: string;
  status: ServerStatus;
  hostname?: string | null;
  os?: string | null;
  platform?: string | null;
  kernel?: string | null;
  arch?: string | null;
  cpuCores?: number | null;
  cpuModel?: string | null;
  memTotalBytes?: ByteCount;
  diskTotalBytes?: ByteCount;
  publicIp?: string | null;
  privateIps?: string[];
  dockerVersion?: string | null;
  agentVersion?: string | null;
  mode?: string;
  tags: string[];
  lastSeenAt?: string | null;
  createdAt: string;
};

export type ServerCreated = {
  server: Server;
  installCommand: string;
};

export type EnrollmentTokenResult = {
  installCommand: string;
  expiresAt?: string;
};

export type Container = {
  id: string;
  serverId: string;
  dockerId: string;
  name: string;
  image: string;
  state: string;
  status: string;
  health?: string | null;
  restartCount: number;
  labels?: Record<string, string> | unknown;
  ports: string[];
  appId?: string | null;
  lastSeenAt: string;
  createdAt?: string;
};

export type AgentCommand = {
  id: string;
  orgId: string;
  serverId: string;
  type: string;
  params?: unknown;
  status: CommandStatus;
  actorType: ActorType;
  actorId?: string | null;
  error?: string | null;
  output?: unknown;
  queuedAt: string;
  sentAt?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  durationMs?: number | null;
};
