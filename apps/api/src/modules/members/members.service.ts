import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import type Redis from 'ioredis';
import type { UpdateMemberInput } from '@nestus/shared';
import { httpError } from '../../common/utils/http-error';
import type { RequestContext } from '../../common/types/request-context';
import { REDIS } from '../redis/redis.constants';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MembersService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async list(orgId: string) {
    return this.prisma.membership.findMany({
      where: { orgId },
      select: {
        id: true,
        role: true,
        createdAt: true,
        user: { select: { id: true, email: true, name: true, avatarUrl: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async update(membershipId: string, input: UpdateMemberInput, ctx: RequestContext) {
    const membership = await this.prisma.membership.findUnique({ where: { id: membershipId } });
    if (!membership) {
      throw httpError(HttpStatus.NOT_FOUND, 'MEMBER_NOT_FOUND', 'Membership not found');
    }
    if (membership.orgId !== ctx.orgId) {
      throw httpError(HttpStatus.FORBIDDEN, 'FORBIDDEN', 'Membership is outside this organization');
    }

    if (input.role === Role.OWNER) {
      const actorMembership =
        ctx.actor.type === 'USER'
          ? await this.prisma.membership.findUnique({
              where: { userId_orgId: { userId: ctx.actor.id, orgId: ctx.orgId } },
            })
          : null;
      if (actorMembership?.role !== Role.OWNER) {
        throw httpError(HttpStatus.FORBIDDEN, 'FORBIDDEN', 'Only owners can grant OWNER');
      }
    }

    if (membership.role === Role.OWNER && input.role !== Role.OWNER) {
      const ownerCount = await this.prisma.membership.count({
        where: { orgId: membership.orgId, role: Role.OWNER },
      });
      if (ownerCount <= 1) {
        throw httpError(HttpStatus.CONFLICT, 'CONFLICT', 'Cannot demote the last owner of the organization');
      }
    }

    const updated = await this.prisma.membership.update({
      where: { id: membershipId },
      data: { role: input.role },
      select: {
        id: true,
        role: true,
        createdAt: true,
        user: { select: { id: true, email: true, name: true, avatarUrl: true } },
      },
    });
    await this.redis.del(`membership:${membership.userId}:${membership.orgId}`);
    return updated;
  }

  async remove(membershipId: string, ctx: RequestContext) {
    const membership = await this.prisma.membership.findUnique({ where: { id: membershipId } });
    if (!membership) {
      throw httpError(HttpStatus.NOT_FOUND, 'MEMBER_NOT_FOUND', 'Membership not found');
    }
    if (membership.orgId !== ctx.orgId) {
      throw httpError(HttpStatus.FORBIDDEN, 'FORBIDDEN', 'Membership is outside this organization');
    }
    if (membership.role === Role.OWNER) {
      const ownerCount = await this.prisma.membership.count({
        where: { orgId: membership.orgId, role: Role.OWNER },
      });
      if (ownerCount <= 1) {
        throw httpError(HttpStatus.CONFLICT, 'CONFLICT', 'Cannot remove the last owner of the organization');
      }
    }
    await this.prisma.membership.delete({ where: { id: membershipId } });
    await this.redis.del(`membership:${membership.userId}:${membership.orgId}`);
    return { ok: true };
  }
}
