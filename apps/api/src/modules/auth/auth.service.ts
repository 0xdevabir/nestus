import { HttpStatus, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import type { Request, Response } from 'express';
import { Role } from '@prisma/client';
import type { LoginInput, RegisterInput } from '@nestus/shared';
import { env, isProd } from '../../config/env';
import { randomToken, sha256 } from '../../common/utils/crypto';
import { slugify } from '../../common/utils/slug';
import { httpError } from '../../common/utils/http-error';
import { PrismaService } from '../prisma/prisma.service';

const REFRESH_COOKIE = 'nestus_rt';
const SESSION_COOKIE = 'nestus_session';
const REFRESH_PATH = '/api/v1/auth';
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const ACCESS_TTL = '15m';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async register(input: RegisterInput, req: Request, res: Response) {
    const email = input.email.toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw httpError(HttpStatus.CONFLICT, 'CONFLICT', 'Email already registered');
    }

    const passwordHash = await argon2.hash(input.password);
    const orgName = `${input.name}'s Org`;
    const slug = await this.uniqueSlug(slugify(`${input.name}s-org`));

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: { email, name: input.name, passwordHash },
      });
      const org = await tx.organization.create({ data: { name: orgName, slug } });
      await tx.membership.create({
        data: { userId: created.id, orgId: org.id, role: Role.OWNER },
      });
      return created;
    });

    return this.issueSession(user.id, req, res);
  }

  async login(input: LoginInput, req: Request, res: Response) {
    const email = input.email.toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user?.passwordHash) {
      throw httpError(HttpStatus.UNAUTHORIZED, 'UNAUTHORIZED', 'Invalid email or password');
    }
    const ok = await argon2.verify(user.passwordHash, input.password);
    if (!ok) {
      throw httpError(HttpStatus.UNAUTHORIZED, 'UNAUTHORIZED', 'Invalid email or password');
    }
    return this.issueSession(user.id, req, res);
  }

  async refresh(req: Request, res: Response) {
    const raw = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    if (!raw) {
      throw httpError(HttpStatus.UNAUTHORIZED, 'UNAUTHORIZED', 'Missing refresh token');
    }

    const hash = sha256(raw);
    const session = await this.prisma.session.findUnique({ where: { refreshTokenHash: hash } });
    if (!session) {
      this.clearRefreshCookie(res);
      throw httpError(HttpStatus.UNAUTHORIZED, 'UNAUTHORIZED', 'Invalid refresh token');
    }

    if (session.revokedAt) {
      await this.prisma.session.updateMany({
        where: { familyId: session.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      this.clearRefreshCookie(res);
      throw httpError(
        HttpStatus.UNAUTHORIZED,
        'SESSION_REVOKED',
        'Refresh token reuse detected; session family revoked',
      );
    }

    if (session.expiresAt.getTime() < Date.now()) {
      await this.prisma.session.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      });
      this.clearRefreshCookie(res);
      throw httpError(HttpStatus.UNAUTHORIZED, 'UNAUTHORIZED', 'Refresh token expired');
    }

    await this.prisma.session.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });

    return this.issueSession(session.userId, req, res, session.familyId);
  }

  async logout(req: Request, res: Response) {
    const raw = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    if (raw) {
      const hash = sha256(raw);
      await this.prisma.session.updateMany({
        where: { refreshTokenHash: hash, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    this.clearRefreshCookie(res);
    return { ok: true };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        createdAt: true,
        memberships: {
          select: {
            id: true,
            role: true,
            org: { select: { id: true, name: true, slug: true, autonomyMode: true } },
          },
        },
      },
    });
    if (!user) {
      throw httpError(HttpStatus.NOT_FOUND, 'USER_NOT_FOUND', 'User not found');
    }
    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        createdAt: user.createdAt,
      },
      memberships: user.memberships.map((m) => ({
        id: m.id,
        role: m.role,
        org: m.org,
      })),
    };
  }

  githubAuthorizeUrl(): string {
    const { GITHUB_CLIENT_ID, API_URL } = env();
    if (!GITHUB_CLIENT_ID) {
      throw httpError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'GitHub OAuth is not configured');
    }
    const redirectUri = `${API_URL}/api/v1/auth/github/callback`;
    const params = new URLSearchParams({
      client_id: GITHUB_CLIENT_ID,
      redirect_uri: redirectUri,
      scope: 'read:user user:email',
    });
    return `https://github.com/login/oauth/authorize?${params.toString()}`;
  }

  async handleGithubCallback(code: string, req: Request, res: Response) {
    const { GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET } = env();
    if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
      throw httpError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'GitHub OAuth is not configured');
    }

    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: GITHUB_CLIENT_ID,
        client_secret: GITHUB_CLIENT_SECRET,
        code,
      }),
    });
    const tokenJson = (await tokenRes.json()) as { access_token?: string };
    if (!tokenJson.access_token) {
      throw httpError(HttpStatus.UNAUTHORIZED, 'UNAUTHORIZED', 'GitHub OAuth failed');
    }

    const ghUserRes = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${tokenJson.access_token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'nestus',
      },
    });
    const ghUser = (await ghUserRes.json()) as {
      id: number;
      login: string;
      name?: string;
      email?: string;
      avatar_url?: string;
    };

    let email = ghUser.email;
    if (!email) {
      const emailsRes = await fetch('https://api.github.com/user/emails', {
        headers: {
          Authorization: `Bearer ${tokenJson.access_token}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'nestus',
        },
      });
      const emails = (await emailsRes.json()) as Array<{
        email: string;
        primary: boolean;
        verified: boolean;
      }>;
      email = emails.find((e) => e.primary && e.verified)?.email ?? emails[0]?.email;
    }
    if (!email) {
      throw httpError(HttpStatus.UNAUTHORIZED, 'UNAUTHORIZED', 'GitHub account has no accessible email');
    }
    email = email.toLowerCase();
    const githubId = String(ghUser.id);

    let user = await this.prisma.user.findFirst({
      where: { OR: [{ githubId }, { email }] },
    });

    if (!user) {
      const name = ghUser.name || ghUser.login;
      const orgName = `${name}'s Org`;
      const slug = await this.uniqueSlug(slugify(`${name}s-org`));
      user = await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: { email, name, githubId, avatarUrl: ghUser.avatar_url },
        });
        const org = await tx.organization.create({ data: { name: orgName, slug } });
        await tx.membership.create({
          data: { userId: created.id, orgId: org.id, role: Role.OWNER },
        });
        return created;
      });
    } else if (!user.githubId) {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: { githubId, avatarUrl: user.avatarUrl ?? ghUser.avatar_url },
      });
    }

    return this.issueSession(user.id, req, res);
  }

  private async issueSession(
    userId: string,
    req: Request,
    res: Response,
    familyId = randomToken(16),
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        createdAt: true,
        memberships: {
          select: {
            id: true,
            role: true,
            org: { select: { id: true, name: true, slug: true, autonomyMode: true } },
          },
        },
      },
    });
    if (!user) {
      throw httpError(HttpStatus.NOT_FOUND, 'USER_NOT_FOUND', 'User not found');
    }

    const accessToken = await this.jwt.signAsync(
      { sub: user.id, email: user.email },
      { secret: env().JWT_ACCESS_SECRET, expiresIn: ACCESS_TTL },
    );

    const refreshToken = randomToken(48);
    const expiresAt = new Date(Date.now() + REFRESH_TTL_MS);
    await this.prisma.session.create({
      data: {
        userId: user.id,
        refreshTokenHash: sha256(refreshToken),
        familyId,
        userAgent: req.headers['user-agent']?.slice(0, 512) ?? null,
        ip: req.ip,
        expiresAt,
      },
    });

    this.setRefreshCookie(res, refreshToken, expiresAt);

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        createdAt: user.createdAt,
      },
      memberships: user.memberships.map((m) => ({
        id: m.id,
        role: m.role,
        org: m.org,
      })),
    };
  }

  private setRefreshCookie(res: Response, token: string, expiresAt: Date) {
    // Refresh token stays scoped to auth routes (plan).
    res.cookie(REFRESH_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProd(),
      path: REFRESH_PATH,
      expires: expiresAt,
    });
    // Path=/ marker so Next.js middleware on app routes can detect a session.
    res.cookie(SESSION_COOKIE, '1', {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProd(),
      path: '/',
      expires: expiresAt,
    });
  }

  private clearRefreshCookie(res: Response) {
    res.clearCookie(REFRESH_COOKIE, {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProd(),
      path: REFRESH_PATH,
    });
    res.clearCookie(SESSION_COOKIE, {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProd(),
      path: '/',
    });
  }

  private async uniqueSlug(base: string): Promise<string> {
    let candidate = base;
    let i = 0;
    while (await this.prisma.organization.findUnique({ where: { slug: candidate } })) {
      i += 1;
      candidate = `${base}-${i}`;
    }
    return candidate;
  }
}
