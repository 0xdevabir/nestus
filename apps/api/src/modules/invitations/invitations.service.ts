import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { CreateInvitationInput } from '@nestus/shared';
import { env, isProd } from '../../config/env';
import { httpError } from '../../common/utils/http-error';
import { randomToken, sha256 } from '../../common/utils/crypto';
import type { RequestContext } from '../../common/types/request-context';
import { PrismaService } from '../prisma/prisma.service';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class InvitationsService {
  private readonly logger = new Logger(InvitationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(orgId: string, input: CreateInvitationInput, ctx: RequestContext) {
    if (input.role === Role.OWNER) {
      const actorMembership =
        ctx.actor.type === 'USER'
          ? await this.prisma.membership.findUnique({
              where: { userId_orgId: { userId: ctx.actor.id, orgId } },
            })
          : null;
      if (actorMembership?.role !== Role.OWNER) {
        throw httpError(HttpStatus.FORBIDDEN, 'FORBIDDEN', 'Only owners can invite as OWNER');
      }
    }

    const email = input.email.toLowerCase();
    const token = randomToken(32);
    const invitation = await this.prisma.invitation.create({
      data: {
        orgId,
        email,
        role: input.role,
        tokenHash: sha256(token),
        invitedById: ctx.actor.id,
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      },
    });

    const inviteUrl = `${env().APP_URL}/invite/${token}`;
    if (!isProd()) {
      this.logger.log(`Invite link for ${email}: ${inviteUrl}`);
    }
    await this.maybeSendEmail(email, inviteUrl);

    return {
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      expiresAt: invitation.expiresAt,
      inviteUrl,
    };
  }

  async accept(token: string, userId: string) {
    const invitation = await this.prisma.invitation.findUnique({
      where: { tokenHash: sha256(token) },
    });
    if (!invitation || invitation.acceptedAt) {
      throw httpError(HttpStatus.NOT_FOUND, 'INVITATION_NOT_FOUND', 'Invitation not found');
    }
    if (invitation.expiresAt.getTime() < Date.now()) {
      throw httpError(HttpStatus.CONFLICT, 'INVITATION_EXPIRED', 'Invitation has expired');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw httpError(HttpStatus.NOT_FOUND, 'USER_NOT_FOUND', 'User not found');
    if (user.email.toLowerCase() !== invitation.email.toLowerCase()) {
      throw httpError(HttpStatus.FORBIDDEN, 'FORBIDDEN', 'Invitation email does not match the signed-in user');
    }

    const membershipSelect = {
      id: true,
      role: true,
      createdAt: true,
      org: { select: { id: true, name: true, slug: true, autonomyMode: true } },
    } as const;

    const existing = await this.prisma.membership.findUnique({
      where: { userId_orgId: { userId, orgId: invitation.orgId } },
      select: membershipSelect,
    });
    if (existing) {
      await this.prisma.invitation.update({
        where: { id: invitation.id },
        data: { acceptedAt: new Date() },
      });
      return existing;
    }

    const [, membership] = await this.prisma.$transaction([
      this.prisma.invitation.update({
        where: { id: invitation.id },
        data: { acceptedAt: new Date() },
      }),
      this.prisma.membership.create({
        data: { userId, orgId: invitation.orgId, role: invitation.role },
        select: membershipSelect,
      }),
    ]);
    return membership;
  }

  private async maybeSendEmail(email: string, inviteUrl: string): Promise<void> {
    const apiKey = env().RESEND_API_KEY;
    if (!apiKey) return;
    const from = env().RESEND_FROM ?? 'NESTUS <noreply@nestus.dev>';
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from,
          to: [email],
          subject: 'You are invited to a NESTUS organization',
          text: `You have been invited to join an organization on NESTUS.\n\nAccept the invite: ${inviteUrl}\n`,
        }),
      });
      if (!res.ok) {
        this.logger.warn(`Resend failed: ${res.status} ${await res.text()}`);
      }
    } catch (err) {
      this.logger.warn(`Resend error: ${err instanceof Error ? err.message : err}`);
    }
  }
}
