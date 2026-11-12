/**
 * Domain enums shared between web, api, agent and ai.
 * Extend these in later phases — do not create parallel enum files.
 */

/** Organization roles (Phase 2). */
export enum Role {
  OWNER = 'OWNER',
  ADMIN = 'ADMIN',
  OPERATOR = 'OPERATOR',
  VIEWER = 'VIEWER',
}

/** Lifecycle status of a managed server. */
export enum ServerStatus {
  PENDING = 'PENDING',
  ONLINE = 'ONLINE',
  OFFLINE = 'OFFLINE',
  DEGRADED = 'DEGRADED',
}

/** Who performed an audited action. */
export enum ActorType {
  USER = 'USER',
  API_KEY = 'API_KEY',
  AGENT = 'AGENT',
  SYSTEM = 'SYSTEM',
  AI = 'AI',
  POLICY = 'POLICY',
}

/** Lifecycle of an agent command. */
export enum CommandStatus {
  QUEUED = 'QUEUED',
  SENT = 'SENT',
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
  RUNNING = 'RUNNING',
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED',
  TIMED_OUT = 'TIMED_OUT',
}
