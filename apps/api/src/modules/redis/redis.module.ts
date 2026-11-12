import { Global, Inject, Module, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { env } from '../../config/env';
import { REDIS, REDIS_SUB } from './redis.constants';

class RedisShutdown implements OnModuleDestroy {
  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(REDIS_SUB) private readonly redisSub: Redis,
  ) {}

  async onModuleDestroy(): Promise<void> {
    await Promise.allSettled([this.redis.quit(), this.redisSub.quit()]);
  }
}

@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      useFactory: () => new Redis(env().REDIS_URL, { maxRetriesPerRequest: null }),
    },
    {
      provide: REDIS_SUB,
      useFactory: () => new Redis(env().REDIS_URL, { maxRetriesPerRequest: null }),
    },
    RedisShutdown,
  ],
  exports: [REDIS, REDIS_SUB],
})
export class RedisModule {}
