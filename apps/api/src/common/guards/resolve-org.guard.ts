import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PrismaService } from '../../modules/prisma/prisma.service';

function routeParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export const RESOLVE_ORG_KEY = 'resolveOrgFrom';
export type ResolveOrgFrom = 'membership' | 'apiKey';

export const ResolveOrgFromParam = (from: ResolveOrgFrom) => SetMetadata(RESOLVE_ORG_KEY, from);

@Injectable()
export class ResolveOrgGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const from = this.reflector.getAllAndOverride<ResolveOrgFrom | undefined>(RESOLVE_ORG_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!from) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const id = routeParam(req.params.id);
    if (!id) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Resource id required' });
    }

    if (from === 'membership') {
      const membership = await this.prisma.membership.findUnique({ where: { id } });
      if (!membership) {
        throw new NotFoundException({ code: 'MEMBER_NOT_FOUND', message: 'Membership not found' });
      }
      req.params.orgId = membership.orgId;
      return true;
    }

    const apiKey = await this.prisma.apiKey.findUnique({ where: { id } });
    if (!apiKey) {
      throw new NotFoundException({ code: 'API_KEY_NOT_FOUND', message: 'API key not found' });
    }
    req.params.orgId = apiKey.orgId;
    return true;
  }
}
