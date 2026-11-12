import { Injectable } from '@nestjs/common';
import type { ActorType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type AuditRecordInput = {
  orgId?: string | null;
  actorType: ActorType;
  actorId?: string | null;
  actorLabel?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Prisma.InputJsonValue | null;
  ip?: string | null;
};

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: AuditRecordInput) {
    return this.prisma.auditLog.create({
      data: {
        orgId: input.orgId ?? null,
        actorType: input.actorType,
        actorId: input.actorId ?? null,
        actorLabel: input.actorLabel ?? null,
        action: input.action,
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
        metadata: input.metadata ?? undefined,
        ip: input.ip ?? null,
      },
    });
  }

  async list(
    orgId: string,
    query: {
      actorType?: string;
      action?: string;
      targetType?: string;
      from?: Date;
      to?: Date;
      cursor?: string;
      limit: number;
    },
  ) {
    const where: Prisma.AuditLogWhereInput = {
      orgId,
      ...(query.actorType ? { actorType: query.actorType as ActorType } : {}),
      ...(query.action ? { action: query.action } : {}),
      ...(query.targetType ? { targetType: query.targetType } : {}),
      ...((query.from || query.to) && {
        createdAt: {
          ...(query.from ? { gte: query.from } : {}),
          ...(query.to ? { lte: query.to } : {}),
        },
      }),
    };

    const rows = await this.prisma.auditLog.findMany({
      where,
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });

    const hasMore = rows.length > query.limit;
    const data = hasMore ? rows.slice(0, query.limit) : rows;
    const nextCursor = hasMore ? data[data.length - 1]?.id : undefined;
    return { data, nextCursor };
  }
}
