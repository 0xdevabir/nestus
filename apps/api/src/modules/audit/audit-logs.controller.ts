import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { createZodDto } from 'nestjs-zod';
import { auditLogQuerySchema } from '@nestus/shared';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { OrgGuard } from '../../common/guards/org.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { AuditService } from './audit.service';

class AuditLogQueryDto extends createZodDto(auditLogQuerySchema) {}

@Controller()
export class AuditLogsController {
  constructor(private readonly audit: AuditService) {}

  @Get('orgs/:orgId/audit-logs')
  @UseGuards(OrgGuard, PermissionGuard)
  @RequirePermission('audit:read')
  list(@Param('orgId') orgId: string, @Query() query: AuditLogQueryDto) {
    return this.audit.list(orgId, query);
  }
}
