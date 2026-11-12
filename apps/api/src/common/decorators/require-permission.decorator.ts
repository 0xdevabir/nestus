import { SetMetadata } from '@nestjs/common';
import type { Permission } from '@nestus/shared';

export const REQUIRE_PERMISSIONS_KEY = 'requirePermissions';
export const RequirePermission = (...perms: Permission[]) =>
  SetMetadata(REQUIRE_PERMISSIONS_KEY, perms);
