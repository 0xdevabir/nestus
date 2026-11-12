import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Request } from 'express';
import type Redis from 'ioredis';
import { ROLE_PERMISSIONS, type Permission } from '@nestus/shared';
import type { Role } from '@prisma/client';
import { REDIS } from '../../modules/redis/redis.constants';
import { PrismaService } from '../../modules/prisma/prisma.service';
import type { RequestContext } from '../types/request-context';

function routeParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

@Injectable()
export class OrgGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const orgId = routeParam(req.params.orgId);
    if (!orgId) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Organization context required' });
    }

    if (req.apiKey) {
      if (req.apiKey.orgId !== orgId) {
        throw new ForbiddenException({
          code: 'FORBIDDEN',
          message: 'API key is not valid for this organization',
        });
      }
      req.ctx = {
        orgId,
        actor: { type: 'API_KEY', id: req.apiKey.id, label: req.apiKey.name },
        permissions: req.apiKey.permissions,
      } satisfies RequestContext;
      return true;
    }

    if (!req.user) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Authentication required' });
    }

    const cacheKey = `membership:${req.user.id}:${orgId}`;
    const cached = await this.redis.get(cacheKey);
    let role: Role | null = null;

    if (cached) {
      role = cached as Role;
    } else {
      const membership = await this.prisma.membership.findUnique({
        where: { userId_orgId: { userId: req.user.id, orgId } },
      });
      if (!membership) {
        const org = await this.prisma.organization.findUnique({ where: { id: orgId } });
        if (!org) {
          throw new NotFoundException({ code: 'ORG_NOT_FOUND', message: 'Organization not found' });
        }
        throw new ForbiddenException({
          code: 'FORBIDDEN',
          message: 'Not a member of this organization',
        });
      }
      role = membership.role;
      await this.redis.set(cacheKey, role, 'EX', 60);
    }

    req.ctx = {
      orgId,
      actor: { type: 'USER', id: req.user.id, label: req.user.email },
      permissions: ROLE_PERMISSIONS[role] as Permission[],
    } satisfies RequestContext;
    return true;
  }
}
