import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job, Queue } from 'bullmq';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { AGENT_PRESENCE_JOB, AGENT_PRESENCE_QUEUE } from './presence.constants';

const OFFLINE_AFTER_MS = 30_000;

@Processor(AGENT_PRESENCE_QUEUE)
export class PresenceProcessor extends WorkerHost {
  private readonly logger = new Logger(PresenceProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
    private readonly audit: AuditService,
  ) {
    super();
  }

  async process(_job: Job): Promise<void> {
    const cutoff = new Date(Date.now() - OFFLINE_AFTER_MS);
    const stale = await this.prisma.server.findMany({
      where: {
        status: 'ONLINE',
        OR: [{ lastSeenAt: { lt: cutoff } }, { lastSeenAt: null }],
      },
      select: { id: true, orgId: true, name: true },
    });

    for (const server of stale) {
      await this.prisma.server.update({
        where: { id: server.id },
        data: { status: 'OFFLINE' },
      });
      this.events.emit('server.offline', { serverId: server.id, orgId: server.orgId });
      await this.audit.record({
        orgId: server.orgId,
        actorType: 'SYSTEM',
        action: 'server.offline',
        targetType: 'server',
        targetId: server.id,
        metadata: { name: server.name },
      });
      this.logger.debug(`Marked server ${server.id} OFFLINE (stale lastSeenAt)`);
    }
  }
}

@Injectable()
export class PresenceMonitor implements OnModuleInit {
  private readonly logger = new Logger(PresenceMonitor.name);

  constructor(@InjectQueue(AGENT_PRESENCE_QUEUE) private readonly queue: Queue) {}

  async onModuleInit(): Promise<void> {
    await this.queue.add(
      AGENT_PRESENCE_JOB,
      {},
      {
        repeat: { every: 15_000 },
        removeOnComplete: 100,
        removeOnFail: 100,
        jobId: 'agent-presence-repeat',
      },
    );
    this.logger.log('Presence monitor scheduled every 15s');
  }
}
