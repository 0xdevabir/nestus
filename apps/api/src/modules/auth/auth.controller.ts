import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/types/request-context';
import { env } from '../../config/env';
import { AuthService } from './auth.service';
import { LoginDto, RegisterDto } from './auth.dto';

@Controller('auth')
@Throttle({ default: { limit: 10, ttl: 60_000 } })
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('register')
  register(@Body() body: RegisterDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.auth.register(body, req, res);
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  login(@Body() body: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.auth.login(body, req, res);
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.auth.refresh(req, res);
  }

  @Public()
  @Post('logout')
  @HttpCode(200)
  logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.auth.logout(req, res);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.id);
  }

  @Public()
  @Get('github')
  github(@Res() res: Response) {
    if (!env().GITHUB_CLIENT_ID) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'GitHub OAuth is not configured' },
      });
    }
    return res.redirect(this.auth.githubAuthorizeUrl());
  }

  @Public()
  @Get('github/callback')
  async githubCallback(
    @Query('code') code: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!env().GITHUB_CLIENT_ID) {
      res.status(404);
      return { error: { code: 'NOT_FOUND', message: 'GitHub OAuth is not configured' } };
    }
    const result = await this.auth.handleGithubCallback(code, req, res);
    if (req.headers.accept?.includes('text/html')) {
      res.redirect(`${env().APP_URL}/login?oauth=1`);
      return;
    }
    return result;
  }
}
