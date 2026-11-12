'use client';

import { useMemo } from 'react';
import { can, type Permission, type Role } from '@nestus/shared';
import { useOrg } from '@/providers/org-provider';

export function usePermission(permission: Permission) {
  const { membership, permissions } = useOrg();

  return useMemo(() => {
    if (permissions?.length) return can(permissions, permission);
    if (membership?.role) return can(membership.role as Role, permission);
    return false;
  }, [membership?.role, permission, permissions]);
}
