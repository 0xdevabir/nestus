import { Controller, Get, Inject } from '@nestjs/common';
import type Redis from 'ioredis';
import { Public } from '../../common/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS } from '../redis/redis.constants';

const startedAt = Date.now();

@Controller()
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  @Public()
  @Get('health')
  async health() {
    let db: 'up' | 'down' = 'down';
    let redisStatus: 'up' | 'down' = 'down';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      db = 'up';
    } catch {
      db = 'down';
    }
    try {
      redisStatus = (await this.redis.ping()) === 'PONG' ? 'up' : 'down';
    } catch {
      redisStatus = 'down';
    }
    return {
      status: db === 'up' && redisStatus === 'up' ? 'ok' : 'degraded',
      db,
      redis: redisStatus,
      version: process.env.npm_package_version ?? '0.1.0',
      uptime: Math.floor((Date.now() - startedAt) / 1000),
    };
  }
}
