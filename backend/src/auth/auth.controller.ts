import { Body, Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import { Throttle } from '@nestjs/throttler';
import { CookieOptions, Request, Response } from 'express';
import { AuthService, AuthenticatedUser } from './auth.service';
import { AuthGuard } from './guards/auth.guard';
import { CurrentUser } from './current-user.decorator';
import { AUTH_COOKIE } from './auth.constants';
import { LoginDto, loginSchema } from './dto/login.dto';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: AppConfigService,
  ) {}

  // Le login est la seule porte d'entree du cote avocat : on la limite plus
  // durement que le reste de l'API.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  async login(
    @Body(new ZodValidationPipe(loginSchema)) dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ user: AuthenticatedUser }> {
    const result = await this.auth.login(dto, request);
    response.cookie(AUTH_COOKIE, result.sessionId, this.cookieOptions(result.expiresAt));
    return { user: result.user };
  }

  @UseGuards(AuthGuard)
  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser): { user: AuthenticatedUser } {
    return { user };
  }

  @Post('logout')
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ status: string }> {
    const sessionId = request.cookies?.[AUTH_COOKIE];
    if (sessionId) {
      await this.auth.logout(sessionId, request);
    }
    response.clearCookie(AUTH_COOKIE, { ...this.cookieOptions(new Date()), maxAge: undefined });
    return { status: 'logged_out' };
  }

  /**
   * SameSite=Lax et non Strict : l'avocat doit rester connecte en arrivant sur
   * le dashboard depuis un lien externe. Lax bloque deja les POST cross-site,
   * ce qui couvre le CSRF sur les routes mutantes.
   */
  private cookieOptions(expiresAt: Date): CookieOptions {
    return {
      httpOnly: true,
      secure: this.config.get('COOKIE_SECURE'),
      sameSite: 'lax',
      path: '/',
      expires: expiresAt,
    };
  }
}
