import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { Observable, tap } from 'rxjs';
import { AUDIT_KEY, type AuditMeta } from '../decorators/audit.decorator';
import { AuditService } from '../../modules/audit/audit.service';

const REDACT_KEYS = new Set([
  'password',
  'passwordhash',
  'token',
  'refreshtoken',
  'accesstoken',
  'key',
  'secret',
  'authorization',
]);

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = REDACT_KEYS.has(k.toLowerCase()) ? '[REDACTED]' : redact(v);
    }
    return out;
  }
  return value;
}

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const meta = this.reflector.getAllAndOverride<AuditMeta | undefined>(AUDIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!meta) return next.handle();

    const req = context.switchToHttp().getRequest<Request>();
    return next.handle().pipe(tap((result) => void this.writeAudit(meta, req, result)));
  }

  private async writeAudit(meta: AuditMeta, req: Request, result: unknown): Promise<void> {
    const ctx = req.ctx;
    const targetParam = meta.options?.targetParam;
    const params = req.params as Record<string, string>;
    let targetId = targetParam ? params[targetParam] : undefined;
    if (!targetId && result && typeof result === 'object' && result !== null && 'id' in result) {
      targetId = String((result as { id: unknown }).id);
    }
    const targetType =
      meta.options?.targetType ??
      (meta.action.includes('.') ? meta.action.split('.')[0] : undefined);

    await this.audit.record({
      orgId: ctx?.orgId ?? params.orgId ?? null,
      actorType: ctx?.actor.type ?? 'USER',
      actorId: ctx?.actor.id ?? req.user?.id ?? req.apiKey?.id ?? null,
      actorLabel: ctx?.actor.label ?? req.user?.email ?? req.apiKey?.name ?? null,
      action: meta.action,
      targetType: targetType ?? null,
      targetId: targetId ?? null,
      metadata: {
        method: req.method,
        path: req.path,
        body: redact(req.body) as object,
      },
      ip: req.ip,
    });
  }
}
