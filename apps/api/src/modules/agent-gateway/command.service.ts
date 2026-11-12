import { randomUUID } from 'node:crypto';
import { HttpStatus, Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  AGENT_COMMAND_TYPES,
  getAgentCommand,
  type AgentCommandType,
} from '@nestus/shared';
import type { ActorType, AgentCommand, Prisma } from '@prisma/client';
import type Redis from 'ioredis';
import { httpError } from '../../common/utils/http-error';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS, REDIS_SUB } from '../redis/redis.constants';
import { AgentConnectionRegistry } from './agent-connection.registry';
import type { Command as ProtoCommand, CommandAck, CommandLog, CommandResult } from '@nestus/proto-ts';

const CMD_CHANNEL_PREFIX = 'agent:cmd:';
const CMD_LOG_PREFIX = 'cmdlog:';
const CMD_LOG_MAX = 500;

export type DispatchActor = {
  type: ActorType;
  id?: string | null;
};

export type DispatchOptions = {
  wait?: boolean;
  timeoutSec?: number;
};

export type DispatchResult = {
  command: AgentCommand;
  timedOut?: boolean;
};

type CmdPubPayload = {
  commandId: string;
  type: string;
  params: Record<string, unknown>;
  timeoutSec: number;
};

@Injectable()
export class CommandService implements OnModuleInit {
  private readonly logger = new Logger(CommandService.name);
  private readonly waiters = new Map<
    string,
    { resolve: (cmd: AgentCommand) => void; reject: (err: Error) => void; timer: NodeJS.Timeout }
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
    private readonly registry: AgentConnectionRegistry,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(REDIS_SUB) private readonly redisSub: Redis,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.redisSub.psubscribe(`${CMD_CHANNEL_PREFIX}*`);
    this.redisSub.on('pmessage', (_pattern, channel, message) => {
      void this.onRedisCommand(channel, message);
    });
  }

  async dispatch(
    orgId: string,
    serverId: string,
    type: string,
    params: unknown,
    actor: DispatchActor,
    options: DispatchOptions = {},
  ): Promise<DispatchResult> {
    const def = getAgentCommand(type);
    if (!def || !AGENT_COMMAND_TYPES.includes(type as AgentCommandType)) {
      throw httpError(HttpStatus.BAD_REQUEST, 'VALIDATION_ERROR', `Unknown command type: ${type}`);
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = def.paramsSchema.parse(params ?? {}) as Record<string, unknown>;
    } catch (err) {
      throw httpError(HttpStatus.BAD_REQUEST, 'VALIDATION_ERROR', 'Invalid command params', {
        cause: err instanceof Error ? err.message : err,
      });
    }

    const timeoutSec = options.timeoutSec ?? def.defaultTimeoutSec;

    const command = await this.prisma.agentCommand.create({
      data: {
        orgId,
        serverId,
        type,
        params: parsed as Prisma.InputJsonValue,
        status: 'QUEUED',
        actorType: actor.type,
        actorId: actor.id ?? null,
      },
    });

    const payload: CmdPubPayload = {
      commandId: command.id,
      type,
      params: parsed,
      timeoutSec,
    };

    await this.redis.publish(`${CMD_CHANNEL_PREFIX}${serverId}`, JSON.stringify(payload));

    const sent = await this.prisma.agentCommand.update({
      where: { id: command.id },
      data: { status: 'SENT', sentAt: new Date() },
    });

    await this.audit.record({
      orgId,
      actorType: actor.type,
      actorId: actor.id ?? null,
      action: `server.command.${type}`,
      targetType: 'server',
      targetId: serverId,
      metadata: { commandId: command.id, type, params: parsed },
    });

    this.events.emit('server.command.dispatched', { orgId, serverId, commandId: command.id, type });

    if (!options.wait) {
      return { command: sent };
    }

    const waited = await this.waitForResult(command.id, timeoutSec);
    return waited;
  }

  /** Best-effort notify without catalog validation (e.g. agent.uninstall). */
  async notifyBestEffort(
    orgId: string,
    serverId: string,
    type: string,
    params: Record<string, unknown>,
    actor: DispatchActor,
  ): Promise<void> {
    try {
      const command = await this.prisma.agentCommand.create({
        data: {
          orgId,
          serverId,
          type,
          params: params as Prisma.InputJsonValue,
          status: 'QUEUED',
          actorType: actor.type,
          actorId: actor.id ?? null,
        },
      });
      const payload: CmdPubPayload = {
        commandId: command.id,
        type,
        params,
        timeoutSec: 30,
      };
      await this.redis.publish(`${CMD_CHANNEL_PREFIX}${serverId}`, JSON.stringify(payload));
      await this.prisma.agentCommand.update({
        where: { id: command.id },
        data: { status: 'SENT', sentAt: new Date() },
      });
    } catch (err) {
      this.logger.warn(
        `Best-effort command ${type} failed for server ${serverId}: ${
          err instanceof Error ? err.message : err
        }`,
      );
    }
  }

  async handleAck(ack: CommandAck): Promise<void> {
    const status = ack.accepted ? 'ACCEPTED' : 'REJECTED';
    const updated = await this.prisma.agentCommand.update({
      where: { id: ack.commandId },
      data: {
        status,
        ...(ack.accepted ? { startedAt: new Date() } : { finishedAt: new Date(), error: ack.reason || 'rejected' }),
      },
    });
    if (!ack.accepted) {
      this.resolveWaiter(updated);
    }
  }

  async handleLog(log: CommandLog): Promise<void> {
    const key = `${CMD_LOG_PREFIX}${log.commandId}`;
    const line = JSON.stringify({
      stream: log.stream,
      line: log.line,
      ts: log.ts?.toISOString?.() ?? new Date().toISOString(),
    });
    await this.redis.rpush(key, line);
    await this.redis.ltrim(key, -CMD_LOG_MAX, -1);
    await this.redis.expire(key, 60 * 60 * 24);
  }

  async handleResult(result: CommandResult): Promise<void> {
    const updated = await this.prisma.agentCommand.update({
      where: { id: result.commandId },
      data: {
        status: result.success ? 'SUCCEEDED' : 'FAILED',
        error: result.error || null,
        output: (result.output ?? null) as Prisma.InputJsonValue,
        finishedAt: new Date(),
        durationMs: result.durationMs ? Number(result.durationMs) : null,
      },
    });
    this.resolveWaiter(updated);
    this.events.emit('server.command.finished', {
      commandId: updated.id,
      serverId: updated.serverId,
      status: updated.status,
    });
  }

  async getLogs(commandId: string): Promise<unknown[]> {
    const rows = await this.redis.lrange(`${CMD_LOG_PREFIX}${commandId}`, 0, -1);
    return rows.map((r) => {
      try {
        return JSON.parse(r) as unknown;
      } catch {
        return { line: r };
      }
    });
  }

  private async waitForResult(commandId: string, timeoutSec: number): Promise<DispatchResult> {
    return new Promise<DispatchResult>((resolve) => {
      const timer = setTimeout(() => {
        this.waiters.delete(commandId);
        void this.prisma.agentCommand
          .update({
            where: { id: commandId },
            data: { status: 'TIMED_OUT', finishedAt: new Date(), error: 'Command timed out' },
          })
          .then((command) => resolve({ command, timedOut: true }))
          .catch(() =>
            this.prisma.agentCommand.findUniqueOrThrow({ where: { id: commandId } }).then((command) =>
              resolve({ command, timedOut: true }),
            ),
          );
      }, timeoutSec * 1000);

      this.waiters.set(commandId, {
        resolve: (command) => {
          clearTimeout(timer);
          resolve({ command, timedOut: false });
        },
        reject: () => {
          clearTimeout(timer);
        },
        timer,
      });
    });
  }

  private resolveWaiter(command: AgentCommand): void {
    const waiter = this.waiters.get(command.id);
    if (!waiter) return;
    this.waiters.delete(command.id);
    clearTimeout(waiter.timer);
    waiter.resolve(command);
  }

  private onRedisCommand(channel: string, message: string): void {
    if (!channel.startsWith(CMD_CHANNEL_PREFIX)) return;
    const serverId = channel.slice(CMD_CHANNEL_PREFIX.length);
    if (!this.registry.has(serverId)) return;

    let payload: CmdPubPayload;
    try {
      payload = JSON.parse(message) as CmdPubPayload;
    } catch {
      this.logger.warn(`Invalid command payload on ${channel}`);
      return;
    }

    const control: ProtoCommand = {
      commandId: payload.commandId,
      type: payload.type,
      params: payload.params,
      timeoutSec: payload.timeoutSec,
      signature: '',
    };

    const ok = this.registry.send(serverId, {
      msgId: randomUUID(),
      payload: { $case: 'command', command: control },
    });
    if (!ok) {
      this.logger.warn(`Failed to write command ${payload.commandId} to stream for ${serverId}`);
    }
  }
}
