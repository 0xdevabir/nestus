import { Body, Controller, Delete, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { Audit } from '../../common/decorators/audit.decorator';
import { CurrentCtx } from '../../common/decorators/current-ctx.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { OrgGuard } from '../../common/guards/org.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ResolveOrgFromParam, ResolveOrgGuard } from '../../common/guards/resolve-org.guard';
import type { RequestContext } from '../../common/types/request-context';
import { UpdateMemberDto } from './members.dto';
import { MembersService } from './members.service';

@Controller()
export class MembersController {
  constructor(private readonly members: MembersService) {}

  @Get('orgs/:orgId/members')
  @UseGuards(OrgGuard, PermissionGuard)
  @RequirePermission('member:read')
  list(@Param('orgId') orgId: string) {
    return this.members.list(orgId);
  }

  @Patch('members/:id')
  @ResolveOrgFromParam('membership')
  @UseGuards(ResolveOrgGuard, OrgGuard, PermissionGuard)
  @RequirePermission('member:update')
  @Audit('member.update', { targetParam: 'id', targetType: 'member' })
  update(@Param('id') id: string, @Body() body: UpdateMemberDto, @CurrentCtx() ctx: RequestContext) {
    return this.members.update(id, body, ctx);
  }

  @Delete('members/:id')
  @ResolveOrgFromParam('membership')
  @UseGuards(ResolveOrgGuard, OrgGuard, PermissionGuard)
  @RequirePermission('member:remove')
  @Audit('member.remove', { targetParam: 'id', targetType: 'member' })
  remove(@Param('id') id: string, @CurrentCtx() ctx: RequestContext) {
    return this.members.remove(id, ctx);
  }
}
