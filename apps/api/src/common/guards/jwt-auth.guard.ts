import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import type Redis from 'ioredis';
import type { Permission } from '@nestus/shared';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { sha256 } from '../utils/crypto';
import { env } from '../../config/env';
import { PrismaService } from '../../modules/prisma/prisma.service';
import { REDIS } from '../../modules/redis/redis.constants';
import type { AuthApiKey, AuthUser } from '../types/request-context';

type AccessPayload = { sub: string; email: string };

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'Missing bearer token' });
    }

    const token = header.slice('Bearer '.length).trim();
    if (!token) {
      throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'Missing bearer token' });
    }

    if (token.startsWith('nst_')) {
      await this.authenticateApiKey(req, token);
      return true;
    }

    await this.authenticateJwt(req, token);
    return true;
  }

  private async authenticateJwt(req: Request, token: string): Promise<void> {
    let payload: AccessPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessPayload>(token, {
        secret: env().JWT_ACCESS_SECRET,
      });
    } catch {
      throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'Invalid access token' });
    }
    req.user = { id: payload.sub, email: payload.email } satisfies AuthUser;
  }

  private async authenticateApiKey(req: Request, rawKey: string): Promise<void> {
    const keyHash = sha256(rawKey);
    const apiKey = await this.prisma.apiKey.findUnique({ where: { keyHash } });
    if (!apiKey || apiKey.revokedAt) {
      throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'Invalid API key' });
    }
    if (apiKey.expiresAt && apiKey.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'API key expired' });
    }

    const debounceKey = `apikey:lastused:${apiKey.id}`;
    const set = await this.redis.set(debounceKey, '1', 'EX', 60, 'NX');
    if (set === 'OK') {
      void this.prisma.apiKey.update({
        where: { id: apiKey.id },
        data: { lastUsedAt: new Date() },
      });
    }

    req.apiKey = {
      id: apiKey.id,
      orgId: apiKey.orgId,
      name: apiKey.name,
      permissions: apiKey.permissions as Permission[],
    } satisfies AuthApiKey;
  }
}
