import { HttpStatus, Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { CreateOrgInput, UpdateOrgInput } from '@nestus/shared';
import { httpError } from '../../common/utils/http-error';
import { slugify } from '../../common/utils/slug';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class OrgsService {
  constructor(private readonly prisma: PrismaService) {}

  async listMine(userId: string) {
    const memberships = await this.prisma.membership.findMany({
      where: { userId },
      select: { id: true, role: true, org: true },
      orderBy: { createdAt: 'asc' },
    });
    return memberships.map((m) => ({
      id: m.org.id,
      name: m.org.name,
      slug: m.org.slug,
      autonomyMode: m.org.autonomyMode,
      createdAt: m.org.createdAt,
      role: m.role,
      membershipId: m.id,
    }));
  }

  async create(userId: string, input: CreateOrgInput) {
    const slug = await this.uniqueSlug(input.slug ?? slugify(input.name));
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.organization.create({
        data: { name: input.name, slug },
      });
      await tx.membership.create({
        data: { userId, orgId: created.id, role: Role.OWNER },
      });
      return created;
    });
  }

  async get(orgId: string) {
    const org = await this.prisma.organization.findUnique({ where: { id: orgId } });
    if (!org) throw httpError(HttpStatus.NOT_FOUND, 'ORG_NOT_FOUND', 'Organization not found');
    return org;
  }

  async update(orgId: string, input: UpdateOrgInput) {
    if (input.slug) {
      const clash = await this.prisma.organization.findFirst({
        where: { slug: input.slug, NOT: { id: orgId } },
      });
      if (clash) throw httpError(HttpStatus.CONFLICT, 'CONFLICT', 'Slug already taken');
    }
    try {
      return await this.prisma.organization.update({
        where: { id: orgId },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.slug !== undefined ? { slug: input.slug } : {}),
          ...(input.autonomyMode !== undefined ? { autonomyMode: input.autonomyMode } : {}),
        },
      });
    } catch {
      throw httpError(HttpStatus.NOT_FOUND, 'ORG_NOT_FOUND', 'Organization not found');
    }
  }

  async remove(orgId: string) {
    try {
      await this.prisma.organization.delete({ where: { id: orgId } });
    } catch {
      throw httpError(HttpStatus.NOT_FOUND, 'ORG_NOT_FOUND', 'Organization not found');
    }
    return { ok: true };
  }

  private async uniqueSlug(base: string): Promise<string> {
    let candidate = base;
    let i = 0;
    while (await this.prisma.organization.findUnique({ where: { slug: candidate } })) {
      i += 1;
      candidate = `${base}-${i}`;
    }
    return candidate;
  }
}
