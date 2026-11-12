import { api, refreshAccessToken } from '@/lib/api';
import type {
  ApiKey,
  ApiKeyCreated,
  AuditLog,
  AuthPayload,
  CursorPage,
  Invitation,
  MeResponse,
  Membership,
  Organization,
} from '@/lib/types';
import type {
  CreateApiKeyInput,
  CreateInvitationInput,
  CreateOrgInput,
  LoginInput,
  RegisterInput,
  UpdateMemberInput,
  UpdateOrgInput,
} from '@nestus/shared';
import { useAuthStore } from '@/stores/auth-store';

export async function register(input: RegisterInput) {
  const data = await api<AuthPayload>('/api/v1/auth/register', {
    method: 'POST',
    body: input,
    auth: false,
  });
  useAuthStore.getState().setSession({
    accessToken: data.accessToken,
    user: data.user,
    memberships: data.memberships,
  });
  return data;
}

export async function login(input: LoginInput) {
  const data = await api<AuthPayload>('/api/v1/auth/login', {
    method: 'POST',
    body: input,
    auth: false,
  });
  useAuthStore.getState().setSession({
    accessToken: data.accessToken,
    user: data.user,
    memberships: data.memberships,
  });
  return data;
}

export async function logout() {
  try {
    await api<void>('/api/v1/auth/logout', { method: 'POST', skipRefresh: true });
  } finally {
    useAuthStore.getState().clearSession();
  }
}

export async function fetchMe() {
  return api<MeResponse>('/api/v1/auth/me');
}

export async function bootstrapSession() {
  const token = await refreshAccessToken();
  if (!token) {
    useAuthStore.getState().setBootstrapped(true);
    return null;
  }
  return useAuthStore.getState();
}

export async function acceptInvitation(token: string) {
  const membership = await api<Membership>(`/api/v1/invitations/${token}/accept`, {
    method: 'POST',
    body: {},
  });
  const me = await fetchMe();
  const accessToken = useAuthStore.getState().accessToken;
  if (accessToken) {
    useAuthStore.getState().setSession({
      accessToken,
      user: me.user,
      memberships: me.memberships,
    });
  }
  return membership;
}

export async function listOrgs() {
  return api<Organization[]>('/api/v1/orgs');
}

export async function createOrg(input: CreateOrgInput) {
  return api<Organization>('/api/v1/orgs', { method: 'POST', body: input });
}

export async function getOrg(orgId: string) {
  return api<Organization>(`/api/v1/orgs/${orgId}`);
}

export async function updateOrg(orgId: string, input: UpdateOrgInput) {
  return api<Organization>(`/api/v1/orgs/${orgId}`, { method: 'PATCH', body: input });
}

export async function listMembers(orgId: string) {
  return api<Membership[]>(`/api/v1/orgs/${orgId}/members`);
}

export async function updateMember(_orgId: string, memberId: string, input: UpdateMemberInput) {
  return api<Membership>(`/api/v1/members/${memberId}`, {
    method: 'PATCH',
    body: input,
  });
}

export async function removeMember(_orgId: string, memberId: string) {
  return api<void>(`/api/v1/members/${memberId}`, { method: 'DELETE' });
}

export async function createInvitation(orgId: string, input: CreateInvitationInput) {
  return api<Invitation>(`/api/v1/orgs/${orgId}/invitations`, {
    method: 'POST',
    body: input,
  });
}

export async function listApiKeys(orgId: string) {
  return api<ApiKey[]>(`/api/v1/orgs/${orgId}/api-keys`);
}

export async function createApiKey(orgId: string, input: CreateApiKeyInput) {
  return api<ApiKeyCreated>(`/api/v1/orgs/${orgId}/api-keys`, {
    method: 'POST',
    body: input,
  });
}

export async function revokeApiKey(_orgId: string, keyId: string) {
  return api<void>(`/api/v1/api-keys/${keyId}`, { method: 'DELETE' });
}

export type AuditLogFilters = {
  actorType?: string;
  action?: string;
  targetType?: string;
  from?: string;
  to?: string;
  cursor?: string;
  limit?: number;
};

export async function listAuditLogs(orgId: string, filters: AuditLogFilters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== '') params.set(key, String(value));
  });
  const qs = params.toString();
  return api<CursorPage<AuditLog>>(
    `/api/v1/orgs/${orgId}/audit-logs${qs ? `?${qs}` : ''}`,
  );
}
