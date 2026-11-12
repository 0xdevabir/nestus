import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { RequestContext } from '../types/request-context';

export const CurrentCtx = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestContext => {
    const req = ctx.switchToHttp().getRequest<Request & { ctx?: RequestContext }>();
    if (!req.ctx) {
      throw new Error('Request context missing — ensure OrgGuard ran');
    }
    return req.ctx;
  },
);
