import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { can, type Permission } from '@nestus/shared';
import { REQUIRE_PERMISSIONS_KEY } from '../decorators/require-permission.decorator';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission[] | undefined>(
      REQUIRE_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required?.length) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const perms = req.ctx?.permissions;
    if (!perms) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Missing organization context' });
    }

    const ok = required.every((p) => can(perms, p));
    if (!ok) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Insufficient permissions',
        details: { required },
      });
    }
    return true;
  }
}
