import { Global, Inject, Module, OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';
import { env } from '../../config/env';
import { PG_POOL } from './pg.constants';

class PgShutdown implements OnModuleDestroy {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}

@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      useFactory: () =>
        new Pool({
          connectionString: env().DATABASE_URL,
          max: 10,
        }),
    },
    PgShutdown,
  ],
  exports: [PG_POOL],
})
export class PgModule {}
