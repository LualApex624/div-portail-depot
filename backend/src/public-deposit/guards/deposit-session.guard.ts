import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { PublicDepositService } from '../public-deposit.service';
import { DEPOSIT_COOKIE, DEPOSIT_SESSION_KEY } from '../public-deposit.constants';

/**
 * Protege les routes de depot.
 *
 * La session est validee contre le token de l'URL : detenir un cookie valide
 * pour une demande ne permet pas de deposer sur une autre.
 */
@Injectable()
export class DepositSessionGuard implements CanActivate {
  constructor(private readonly publicDeposit: PublicDepositService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const sessionId = request.cookies?.[DEPOSIT_COOKIE];
    const token = request.params?.token;

    if (!sessionId || !token) {
      throw new UnauthorizedException('Session de depot absente ou expiree.');
    }

    const session = await this.publicDeposit.resolveSession(sessionId, token);
    if (!session) {
      throw new UnauthorizedException('Session de depot absente ou expiree.');
    }

    Reflect.set(request, DEPOSIT_SESSION_KEY, session);
    return true;
  }
}
