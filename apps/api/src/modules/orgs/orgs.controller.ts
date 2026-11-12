import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Audit } from '../../common/decorators/audit.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { OrgGuard } from '../../common/guards/org.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import type { AuthUser } from '../../common/types/request-context';
import { CreateOrgDto, UpdateOrgDto } from './orgs.dto';
import { OrgsService } from './orgs.service';

@Controller('orgs')
export class OrgsController {
  constructor(private readonly orgs: OrgsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.orgs.listMine(user.id);
  }

  @Post()
  @Audit('org.create')
  create(@CurrentUser() user: AuthUser, @Body() body: CreateOrgDto) {
    return this.orgs.create(user.id, body);
  }

  @Get(':orgId')
  @UseGuards(OrgGuard, PermissionGuard)
  @RequirePermission('org:read')
  get(@Param('orgId') orgId: string) {
    return this.orgs.get(orgId);
  }

  @Patch(':orgId')
  @UseGuards(OrgGuard, PermissionGuard)
  @RequirePermission('org:update')
  @Audit('org.update', { targetParam: 'orgId', targetType: 'org' })
  update(@Param('orgId') orgId: string, @Body() body: UpdateOrgDto) {
    return this.orgs.update(orgId, body);
  }

  @Delete(':orgId')
  @UseGuards(OrgGuard, PermissionGuard)
  @RequirePermission('org:delete')
  @Audit('org.delete', { targetParam: 'orgId', targetType: 'org' })
  remove(@Param('orgId') orgId: string) {
    return this.orgs.remove(orgId);
  }
}
