import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { Audit } from '../../common/decorators/audit.decorator';
import { CurrentCtx } from '../../common/decorators/current-ctx.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { OrgGuard } from '../../common/guards/org.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import type { AuthUser, RequestContext } from '../../common/types/request-context';
import { CreateInvitationDto } from './invitations.dto';
import { InvitationsService } from './invitations.service';

@Controller()
export class InvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  @Post('orgs/:orgId/invitations')
  @UseGuards(OrgGuard, PermissionGuard)
  @RequirePermission('member:invite')
  @Audit('member.invite', { targetType: 'invitation' })
  create(
    @Param('orgId') orgId: string,
    @Body() body: CreateInvitationDto,
    @CurrentCtx() ctx: RequestContext,
  ) {
    return this.invitations.create(orgId, body, ctx);
  }

  @Post('invitations/:token/accept')
  @Audit('invitation.accept', { targetParam: 'token', targetType: 'invitation' })
  accept(@Param('token') token: string, @CurrentUser() user: AuthUser) {
    return this.invitations.accept(token, user.id);
  }
}
