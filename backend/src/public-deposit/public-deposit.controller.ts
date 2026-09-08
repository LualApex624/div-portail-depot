import { Body, Controller, Get, Param, Post, Req, Res, UseGuards } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import { Throttle } from '@nestjs/throttler';
import { CookieOptions, Request, Response } from 'express';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { PublicDepositService, DepositSessionContext, DepositView } from './public-deposit.service';
import { DepositSessionGuard } from './guards/deposit-session.guard';
import { DepositSession } from './deposit-session.decorator';
import { DEPOSIT_COOKIE } from './public-deposit.constants';
import { UnlockDto, unlockSchema } from './dto/unlock.dto';
import { InitUploadDto, initUploadSchema } from './dto/init-upload.dto';
import { CompleteUploadDto, completeUploadSchema } from './dto/complete-upload.dto';

@Controller('public')
export class PublicDepositController {
  constructor(
    private readonly publicDeposit: PublicDepositService,
    private readonly config: AppConfigService,
  ) {}

  @Get(':token')
  describe(@Param('token') token: string, @Req() request: Request) {
    return this.publicDeposit.describeLink(token, request);
  }

  /**
   * 10 tentatives par minute et par IP. Combine au lockout a 5 echecs, le PIN
   * a 8 chiffres devient hors de portee d'un brute-force en ligne.
   */
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post(':token/unlock')
  async unlock(
    @Param('token') token: string,
    @Body(new ZodValidationPipe(unlockSchema)) dto: UnlockDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<DepositView> {
    const result = await this.publicDeposit.unlock(token, dto, request);
    response.cookie(DEPOSIT_COOKIE, result.sessionId, this.cookieOptions(result.expiresAt));
    return result.view;
  }

  @UseGuards(DepositSessionGuard)
  @Get(':token/session')
  session(@DepositSession() session: DepositSessionContext): Promise<DepositView> {
    return this.publicDeposit.getView(session.requestId);
  }

  @UseGuards(DepositSessionGuard)
  @Post(':token/files/init')
  initUpload(
    @DepositSession() session: DepositSessionContext,
    @Body(new ZodValidationPipe(initUploadSchema)) dto: InitUploadDto,
    @Req() request: Request,
  ) {
    return this.publicDeposit.initUpload(session.requestId, dto, request);
  }

  @UseGuards(DepositSessionGuard)
  @Post(':token/files/complete')
  completeUpload(
    @DepositSession() session: DepositSessionContext,
    @Body(new ZodValidationPipe(completeUploadSchema)) dto: CompleteUploadDto,
    @Req() request: Request,
  ) {
    return this.publicDeposit.completeUpload(session.requestId, dto.fileId, request);
  }

  /**
   * SameSite=Strict : ce cookie n'a aucune raison d'accompagner une navigation
   * venue d'un autre site. C'est plus strict que le cookie avocat, parce que
   * la session de depot est le seul rempart devant l'ecriture d'objets.
   */
  private cookieOptions(expiresAt: Date): CookieOptions {
    return {
      httpOnly: true,
      secure: this.config.get('COOKIE_SECURE'),
      sameSite: 'strict',
      path: '/',
      expires: expiresAt,
    };
  }
}
