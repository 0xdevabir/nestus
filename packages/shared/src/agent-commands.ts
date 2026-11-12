import { z } from 'zod';
import type { Permission } from './rbac';

export type AgentCommandDef<T extends z.ZodTypeAny = z.ZodTypeAny> = {
  paramsSchema: T;
  defaultTimeoutSec: number;
  permission: Permission;
};

const emptyParams = z.object({}).default({});

const containerIdParams = z.object({
  containerId: z.string().min(1),
  timeoutSec: z.number().int().positive().optional(),
});

/**
 * Typed command catalog shared by the API (validation + RBAC) and documented for the agent.
 * The Go agent has a parallel registry; both must stay in sync for phase-3 command types.
 */
export const AGENT_COMMANDS = {
  'system.ping': {
    paramsSchema: emptyParams,
    defaultTimeoutSec: 5,
    permission: 'server:command',
  },
  'system.info': {
    paramsSchema: emptyParams,
    defaultTimeoutSec: 10,
    permission: 'server:command',
  },
  'docker.list': {
    paramsSchema: emptyParams,
    defaultTimeoutSec: 15,
    permission: 'server:command',
  },
  'docker.inspect': {
    paramsSchema: z.object({ containerId: z.string().min(1) }),
    defaultTimeoutSec: 15,
    permission: 'server:command',
  },
  'docker.start': {
    paramsSchema: containerIdParams,
    defaultTimeoutSec: 60,
    permission: 'server:command',
  },
  'docker.stop': {
    paramsSchema: containerIdParams,
    defaultTimeoutSec: 60,
    permission: 'server:command',
  },
  'docker.restart': {
    paramsSchema: containerIdParams,
    defaultTimeoutSec: 90,
    permission: 'server:command',
  },
} as const satisfies Record<string, AgentCommandDef>;

export type AgentCommandType = keyof typeof AGENT_COMMANDS;

export const AGENT_COMMAND_TYPES = Object.keys(AGENT_COMMANDS) as AgentCommandType[];

export function getAgentCommand(type: string): AgentCommandDef | undefined {
  return AGENT_COMMANDS[type as AgentCommandType];
}

export function parseAgentCommandParams<T extends AgentCommandType>(
  type: T,
  params: unknown,
): z.infer<(typeof AGENT_COMMANDS)[T]['paramsSchema']> {
  return AGENT_COMMANDS[type].paramsSchema.parse(params ?? {});
}
