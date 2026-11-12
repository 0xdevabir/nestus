'use client';

import { create } from 'zustand';
import type { Membership, User } from '@/lib/types';

type AuthState = {
  accessToken: string | null;
  user: User | null;
  memberships: Membership[];
  bootstrapped: boolean;
  setSession: (payload: {
    accessToken: string;
    user: User;
    memberships: Membership[];
  }) => void;
  setAccessToken: (token: string | null) => void;
  setBootstrapped: (value: boolean) => void;
  clearSession: () => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  user: null,
  memberships: [],
  bootstrapped: false,
  setSession: ({ accessToken, user, memberships }) =>
    set({ accessToken, user, memberships, bootstrapped: true }),
  setAccessToken: (accessToken) => set({ accessToken }),
  setBootstrapped: (bootstrapped) => set({ bootstrapped }),
  clearSession: () =>
    set({ accessToken: null, user: null, memberships: [], bootstrapped: true }),
}));

export function getAccessToken() {
  return useAuthStore.getState().accessToken;
}

export function setAccessToken(token: string | null) {
  useAuthStore.getState().setAccessToken(token);
}

export function clearAuthSession() {
  useAuthStore.getState().clearSession();
}
