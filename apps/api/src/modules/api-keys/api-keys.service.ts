import { HttpStatus, Injectable } from '@nestjs/common';
import { ALL_PERMISSIONS, type CreateApiKeyInput, type Permission } from '@nestus/shared';
import { httpError } from '../../common/utils/http-error';
import { randomBase62, sha256 } from '../../common/utils/crypto';
import type { RequestContext } from '../../common/types/request-context';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ApiKeysService {
  constructor(private readonly prisma: PrismaService) {}

  async list(orgId: string) {
    return this.prisma.apiKey.findMany({
      where: { orgId },
      select: {
        id: true,
        name: true,
        prefix: true,
        permissions: true,
        createdById: true,
        lastUsedAt: true,
        expiresAt: true,
        revokedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(orgId: string, input: CreateApiKeyInput, ctx: RequestContext) {
    const permissions = (input.permissions?.length ? input.permissions : ctx.permissions) as Permission[];
    const invalid = permissions.filter((p) => !ALL_PERMISSIONS.includes(p as Permission));
    if (invalid.length) {
      throw httpError(HttpStatus.BAD_REQUEST, 'VALIDATION_ERROR', 'Invalid permissions', { invalid });
    }
    const unauthorized = permissions.filter((p) => !ctx.permissions.includes(p));
    if (unauthorized.length) {
      throw httpError(HttpStatus.FORBIDDEN, 'FORBIDDEN', 'Cannot grant permissions you do not have', {
        unauthorized,
      });
    }

    const raw = `nst_${randomBase62(32)}`;
    const created = await this.prisma.apiKey.create({
      data: {
        orgId,
        name: input.name,
        prefix: raw.slice(0, 8),
        keyHash: sha256(raw),
        permissions,
        createdById: ctx.actor.id,
        expiresAt: input.expiresAt ?? null,
      },
      select: {
        id: true,
        name: true,
        prefix: true,
        permissions: true,
        createdById: true,
        expiresAt: true,
        createdAt: true,
      },
    });
    return { ...created, key: raw };
  }

  async revoke(id: string, ctx: RequestContext) {
    const apiKey = await this.prisma.apiKey.findUnique({ where: { id } });
    if (!apiKey || apiKey.orgId !== ctx.orgId) {
      throw httpError(HttpStatus.NOT_FOUND, 'API_KEY_NOT_FOUND', 'API key not found');
    }
    if (apiKey.revokedAt) return { id: apiKey.id, revokedAt: apiKey.revokedAt };
    return this.prisma.apiKey.update({
      where: { id },
      data: { revokedAt: new Date() },
      select: { id: true, revokedAt: true },
    });
  }
}
