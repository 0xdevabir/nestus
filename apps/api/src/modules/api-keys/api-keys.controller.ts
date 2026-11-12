import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Audit } from '../../common/decorators/audit.decorator';
import { CurrentCtx } from '../../common/decorators/current-ctx.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { OrgGuard } from '../../common/guards/org.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ResolveOrgFromParam, ResolveOrgGuard } from '../../common/guards/resolve-org.guard';
import type { RequestContext } from '../../common/types/request-context';
import { CreateApiKeyDto } from './api-keys.dto';
import { ApiKeysService } from './api-keys.service';

@Controller()
export class ApiKeysController {
  constructor(private readonly apiKeys: ApiKeysService) {}

  @Get('orgs/:orgId/api-keys')
  @UseGuards(OrgGuard, PermissionGuard)
  @RequirePermission('apikey:read')
  list(@Param('orgId') orgId: string) {
    return this.apiKeys.list(orgId);
  }

  @Post('orgs/:orgId/api-keys')
  @UseGuards(OrgGuard, PermissionGuard)
  @RequirePermission('apikey:write')
  @Audit('apikey.create', { targetType: 'apiKey' })
  create(@Param('orgId') orgId: string, @Body() body: CreateApiKeyDto, @CurrentCtx() ctx: RequestContext) {
    return this.apiKeys.create(orgId, body, ctx);
  }

  @Delete('api-keys/:id')
  @ResolveOrgFromParam('apiKey')
  @UseGuards(ResolveOrgGuard, OrgGuard, PermissionGuard)
  @RequirePermission('apikey:write')
  @Audit('apikey.revoke', { targetParam: 'id', targetType: 'apiKey' })
  revoke(@Param('id') id: string, @CurrentCtx() ctx: RequestContext) {
    return this.apiKeys.revoke(id, ctx);
  }
}
