import type { ApiError, ApiErrorResponse } from '@nestus/shared';
import { clearAuthSession, getAccessToken, useAuthStore } from '@/stores/auth-store';
import type { AuthPayload } from '@/lib/types';

const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000').replace(/\/$/, '');

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, error: ApiError) {
    super(error.message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = error.code;
    this.details = error.details;
  }
}

type RequestOptions = Omit<RequestInit, 'body'> & {
  body?: unknown;
  auth?: boolean;
  skipRefresh?: boolean;
};

let refreshPromise: Promise<string | null> | null = null;

async function parseError(res: Response): Promise<ApiClientError> {
  try {
    const json = (await res.json()) as ApiErrorResponse;
    if (json?.error?.message) return new ApiClientError(res.status, json.error);
  } catch {
    // ignore
  }
  return new ApiClientError(res.status, {
    code: 'INTERNAL_ERROR',
    message: res.statusText || 'Request failed',
  });
}

export async function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
          headers: { Accept: 'application/json' },
        });
        if (!res.ok) {
          clearAuthSession();
          return null;
        }
        const data = (await res.json()) as AuthPayload;
        useAuthStore.getState().setSession({
          accessToken: data.accessToken,
          user: data.user,
          memberships: data.memberships,
        });
        return data.accessToken;
      } catch {
        clearAuthSession();
        return null;
      } finally {
        refreshPromise = null;
      }
    })();
  }
  return refreshPromise;
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, auth = true, skipRefresh = false, headers, ...init } = options;
  const url = path.startsWith('http')
    ? path
    : `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;

  const reqHeaders = new Headers(headers);
  if (!reqHeaders.has('Accept')) reqHeaders.set('Accept', 'application/json');
  if (body !== undefined && !reqHeaders.has('Content-Type')) {
    reqHeaders.set('Content-Type', 'application/json');
  }
  if (auth) {
    const token = getAccessToken();
    if (token) reqHeaders.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(url, {
    ...init,
    headers: reqHeaders,
    credentials: 'include',
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (res.status === 401 && auth && !skipRefresh) {
    const nextToken = await refreshAccessToken();
    if (nextToken) {
      reqHeaders.set('Authorization', `Bearer ${nextToken}`);
      const retry = await fetch(url, {
        ...init,
        headers: reqHeaders,
        credentials: 'include',
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (!retry.ok) throw await parseError(retry);
      if (retry.status === 204) return undefined as T;
      return (await retry.json()) as T;
    }
    throw await parseError(res);
  }

  if (!res.ok) throw await parseError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export async function fetchHealth() {
  return api<{
    status: string;
    db?: string;
    redis?: string;
    version?: string;
    uptime?: number;
  }>(`${API_BASE}/health`, { auth: false, skipRefresh: true });
}

export { API_BASE };
