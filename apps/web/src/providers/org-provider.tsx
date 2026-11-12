'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ROLE_PERMISSIONS, type Permission, type Role } from '@nestus/shared';
import { listOrgs } from '@/lib/auth-api';
import type { Membership, Organization } from '@/lib/types';
import { useAuthStore } from '@/stores/auth-store';

type OrgContextValue = {
  orgSlug: string;
  org: Organization | null;
  membership: Membership | null;
  permissions: Permission[];
  orgs: Organization[];
  isLoading: boolean;
};

const OrgContext = createContext<OrgContextValue | null>(null);

export function OrgProvider({
  orgSlug,
  children,
}: {
  orgSlug: string;
  children: ReactNode;
}) {
  const memberships = useAuthStore((s) => s.memberships);

  const orgsQuery = useQuery({
    queryKey: ['orgs'],
    queryFn: listOrgs,
  });

  const value = useMemo<OrgContextValue>(() => {
    const fromMemberships = memberships
      .map((m) => m.org)
      .filter((o): o is Organization => Boolean(o));
    const orgs = orgsQuery.data?.length ? orgsQuery.data : fromMemberships;

    const org =
      orgs.find((o) => o.slug === orgSlug) ??
      memberships.find((m) => m.org?.slug === orgSlug)?.org ??
      null;

    const membership =
      memberships.find((m) => m.org?.slug === orgSlug || m.orgId === org?.id) ?? null;

    const permissions: Permission[] = membership?.role
      ? ROLE_PERMISSIONS[membership.role as Role]
      : [];

    return {
      orgSlug,
      org,
      membership,
      permissions,
      orgs,
      isLoading: orgsQuery.isLoading,
    };
  }, [memberships, orgSlug, orgsQuery.data, orgsQuery.isLoading]);

  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
}

export function useOrg() {
  const ctx = useContext(OrgContext);
  if (!ctx) throw new Error('useOrg must be used within OrgProvider');
  return ctx;
}
