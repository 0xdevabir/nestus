import { Injectable, Logger } from '@nestjs/common';
import type { ContainerInfo } from '@nestus/proto-ts';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const REMOVED_TTL_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class ContainerSyncService {
  private readonly logger = new Logger(ContainerSyncService.name);

  constructor(private readonly prisma: PrismaService) {}

  async syncSnapshot(serverId: string, containers: ContainerInfo[]): Promise<void> {
    const now = new Date();
    const seenIds = new Set<string>();

    for (const c of containers) {
      if (!c.id) continue;
      seenIds.add(c.id);
      const labels = c.labels ?? {};
      const appId =
        typeof labels['nestus.app'] === 'string' && labels['nestus.app'].length > 0
          ? labels['nestus.app']
          : null;

      await this.prisma.container.upsert({
        where: { serverId_dockerId: { serverId, dockerId: c.id } },
        create: {
          serverId,
          dockerId: c.id,
          name: c.name || c.id,
          image: c.image || '',
          state: c.state || 'unknown',
          status: c.status || '',
          health: c.health || null,
          restartCount: c.restartCount ?? 0,
          labels: labels as Prisma.InputJsonValue,
          ports: c.ports ?? [],
          appId,
          lastSeenAt: now,
        },
        update: {
          name: c.name || c.id,
          image: c.image || '',
          state: c.state || 'unknown',
          status: c.status || '',
          health: c.health || null,
          restartCount: c.restartCount ?? 0,
          labels: labels as Prisma.InputJsonValue,
          ports: c.ports ?? [],
          appId,
          lastSeenAt: now,
        },
      });
    }

    const existing = await this.prisma.container.findMany({
      where: { serverId, state: { not: 'removed' } },
      select: { id: true, dockerId: true },
    });

    const missingIds = existing.filter((row) => !seenIds.has(row.dockerId)).map((row) => row.id);
    if (missingIds.length) {
      await this.prisma.container.updateMany({
        where: { id: { in: missingIds } },
        data: { state: 'removed', lastSeenAt: now },
      });
    }

    const cutoff = new Date(Date.now() - REMOVED_TTL_MS);
    const deleted = await this.prisma.container.deleteMany({
      where: { serverId, state: 'removed', lastSeenAt: { lt: cutoff } },
    });
    if (deleted.count > 0) {
      this.logger.debug(`Purged ${deleted.count} removed containers for server ${serverId}`);
    }
  }
}
