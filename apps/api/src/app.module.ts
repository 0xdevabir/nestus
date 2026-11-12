import { randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { BullModule } from '@nestjs/bullmq';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { ZodValidationPipe } from 'nestjs-zod';
import { env } from './config/env';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { OrgGuard } from './common/guards/org.guard';
import { PermissionGuard } from './common/guards/permission.guard';
import { ResolveOrgGuard } from './common/guards/resolve-org.guard';
import { AuditInterceptor } from './common/interceptors/audit.interceptor';
import { PrismaModule } from './modules/prisma/prisma.module';
import { RedisModule } from './modules/redis/redis.module';
import { PgModule } from './modules/pg/pg.module';
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { OrgsModule } from './modules/orgs/orgs.module';
import { MembersModule } from './modules/members/members.module';
import { InvitationsModule } from './modules/invitations/invitations.module';
import { ApiKeysModule } from './modules/api-keys/api-keys.module';
import { AuditModule } from './modules/audit/audit.module';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        genReqId: (req, res) => {
          const existing = req.headers['x-request-id'];
          const id = typeof existing === 'string' && existing.length > 0 ? existing : randomUUID();
          res.setHeader('x-request-id', id);
          return id;
        },
        customProps: (req) => ({ reqId: req.id }),
        transport:
          env().NODE_ENV === 'development'
            ? { target: 'pino-pretty', options: { singleLine: true, colorize: true } }
            : undefined,
        quietReqLogger: true,
      },
    }),
    EventEmitterModule.forRoot({ wildcard: true }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    BullModule.forRootAsync({
      useFactory: () => {
        const url = new URL(env().REDIS_URL);
        return {
          connection: {
            host: url.hostname,
            port: Number(url.port || 6379),
            password: url.password || undefined,
            username: url.username || undefined,
            maxRetriesPerRequest: null,
          },
        };
      },
    }),
    PrismaModule,
    RedisModule,
    PgModule,
    HealthModule,
    AuthModule,
    OrgsModule,
    MembersModule,
    InvitationsModule,
    ApiKeysModule,
    AuditModule,
  ],
  providers: [
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    OrgGuard,
    PermissionGuard,
    ResolveOrgGuard,
  ],
})
export class AppModule {}
