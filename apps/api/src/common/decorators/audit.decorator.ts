import { SetMetadata } from '@nestjs/common';

export type AuditOptions = {
  targetParam?: string;
  targetType?: string;
};

export const AUDIT_KEY = 'auditMeta';
export type AuditMeta = { action: string; options?: AuditOptions };

export const Audit = (action: string, options?: AuditOptions) =>
  SetMetadata(AUDIT_KEY, { action, options } satisfies AuditMeta);
