import { api } from '@/lib/api';
import type {
  AgentCommand,
  Container,
  CursorPage,
  EnrollmentTokenResult,
  Server,
  ServerCreated,
} from '@/lib/types';
import type { CreateServerInput, UpdateServerInput } from '@nestus/shared';

export type ListServersFilters = {
  status?: string;
  tag?: string;
  q?: string;
  cursor?: string;
  limit?: number;
};

function toQuery(filters: Record<string, string | number | undefined>) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== '') params.set(key, String(value));
  });
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export async function listServers(orgId: string, filters: ListServersFilters = {}) {
  return api<CursorPage<Server>>(
    `/api/v1/orgs/${orgId}/servers${toQuery(filters)}`,
  );
}

export async function createServer(orgId: string, input: CreateServerInput) {
  return api<ServerCreated>(`/api/v1/orgs/${orgId}/servers`, {
    method: 'POST',
    body: input,
  });
}

export async function getServer(serverId: string) {
  return api<Server>(`/api/v1/servers/${serverId}`);
}

export async function updateServer(serverId: string, input: UpdateServerInput) {
  return api<Server>(`/api/v1/servers/${serverId}`, {
    method: 'PATCH',
    body: input,
  });
}

export async function deleteServer(serverId: string) {
  return api<void>(`/api/v1/servers/${serverId}`, { method: 'DELETE' });
}

export async function regenerateEnrollmentToken(serverId: string) {
  return api<EnrollmentTokenResult>(`/api/v1/servers/${serverId}/enrollment-token`, {
    method: 'POST',
    body: {},
  });
}

export async function listContainers(serverId: string) {
  return api<Container[]>(`/api/v1/servers/${serverId}/containers`);
}

export type ContainerAction = 'start' | 'stop' | 'restart';

export async function containerAction(
  serverId: string,
  dockerId: string,
  action: ContainerAction,
) {
  return api<AgentCommand>(
    `/api/v1/servers/${serverId}/containers/${encodeURIComponent(dockerId)}/${action}`,
    { method: 'POST', body: {} },
  );
}

export type ListCommandsFilters = {
  cursor?: string;
  limit?: number;
};

export async function listCommands(serverId: string, filters: ListCommandsFilters = {}) {
  return api<CursorPage<AgentCommand>>(
    `/api/v1/servers/${serverId}/commands${toQuery(filters)}`,
  );
}

export async function getCommand(commandId: string) {
  return api<AgentCommand>(`/api/v1/commands/${commandId}`);
}
