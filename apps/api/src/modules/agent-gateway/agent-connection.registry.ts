import { Injectable } from '@nestjs/common';
import type { ServerDuplexStream } from '@grpc/grpc-js';
import type { AgentMessage, ControlMessage } from '@nestus/proto-ts';

export type AgentSession = {
  serverId: string;
  orgId: string;
  agentId: string;
  stream: ServerDuplexStream<AgentMessage, ControlMessage>;
  pingTimer?: NodeJS.Timeout;
  subscribed: boolean;
};

@Injectable()
export class AgentConnectionRegistry {
  private readonly sessions = new Map<string, AgentSession>();

  set(serverId: string, session: AgentSession): void {
    const existing = this.sessions.get(serverId);
    if (existing && existing !== session) {
      try {
        existing.stream.end();
      } catch {
        /* ignore */
      }
      if (existing.pingTimer) clearInterval(existing.pingTimer);
    }
    this.sessions.set(serverId, session);
  }

  get(serverId: string): AgentSession | undefined {
    return this.sessions.get(serverId);
  }

  delete(serverId: string, session?: AgentSession): void {
    const current = this.sessions.get(serverId);
    if (!current) return;
    if (session && current !== session) return;
    if (current.pingTimer) clearInterval(current.pingTimer);
    this.sessions.delete(serverId);
  }

  has(serverId: string): boolean {
    return this.sessions.has(serverId);
  }

  send(serverId: string, message: ControlMessage): boolean {
    const session = this.sessions.get(serverId);
    if (!session) return false;
    try {
      session.stream.write(message);
      return true;
    } catch {
      return false;
    }
  }
}
