import { Role } from './enums';

/**
 * Fine-grained permissions covering every product module.
 * Later phases only consume these — they do not redefine them.
 */
export type Permission =
  | 'org:read'
  | 'org:update'
  | 'org:delete'
  | 'member:read'
  | 'member:invite'
  | 'member:update'
  | 'member:remove'
  | 'apikey:read'
  | 'apikey:write'
  | 'audit:read'
  | 'server:read'
  | 'server:write'
  | 'server:command'
  | 'app:read'
  | 'app:write'
  | 'deployment:read'
  | 'deployment:create'
  | 'deployment:approve'
  | 'deployment:rollback'
  | 'env:read'
  | 'env:reveal'
  | 'env:write'
  | 'logs:read'
  | 'metrics:read'
  | 'incident:read'
  | 'incident:write'
  | 'alert:read'
  | 'alert:write'
  | 'action:propose'
  | 'action:approve'
  | 'action:execute'
  | 'policy:read'
  | 'policy:write'
  | 'ai:use'
  | 'ai:investigate'
  | 'cluster:read'
  | 'cluster:write'
  | 'settings:write';

export const ALL_PERMISSIONS: Permission[] = [
  'org:read',
  'org:update',
  'org:delete',
  'member:read',
  'member:invite',
  'member:update',
  'member:remove',
  'apikey:read',
  'apikey:write',
  'audit:read',
  'server:read',
  'server:write',
  'server:command',
  'app:read',
  'app:write',
  'deployment:read',
  'deployment:create',
  'deployment:approve',
  'deployment:rollback',
  'env:read',
  'env:reveal',
  'env:write',
  'logs:read',
  'metrics:read',
  'incident:read',
  'incident:write',
  'alert:read',
  'alert:write',
  'action:propose',
  'action:approve',
  'action:execute',
  'policy:read',
  'policy:write',
  'ai:use',
  'ai:investigate',
  'cluster:read',
  'cluster:write',
  'settings:write',
];

const READ_PERMISSIONS: Permission[] = ALL_PERMISSIONS.filter(
  (p) => p.endsWith(':read') && p !== 'env:reveal',
);

const VIEWER_PERMISSIONS: Permission[] = [...READ_PERMISSIONS];

const OPERATOR_PERMISSIONS: Permission[] = [
  ...VIEWER_PERMISSIONS,
  'server:command',
  'deployment:create',
  'deployment:rollback',
  'incident:write',
  'action:propose',
  'action:execute',
  'ai:use',
  'ai:investigate',
];

const ADMIN_PERMISSIONS: Permission[] = ALL_PERMISSIONS.filter((p) => p !== 'org:delete');

const OWNER_PERMISSIONS: Permission[] = [...ALL_PERMISSIONS];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  [Role.VIEWER]: VIEWER_PERMISSIONS,
  [Role.OPERATOR]: OPERATOR_PERMISSIONS,
  [Role.ADMIN]: ADMIN_PERMISSIONS,
  [Role.OWNER]: OWNER_PERMISSIONS,
};

/** Check whether a role or an explicit permission list grants `permission`. */
export function can(roleOrPerms: Role | Permission[], permission: Permission): boolean {
  const perms = typeof roleOrPerms === 'string' ? ROLE_PERMISSIONS[roleOrPerms] : roleOrPerms;
  return perms.includes(permission);
}
