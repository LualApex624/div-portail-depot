import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from '../auth.service';
import { AUTH_COOKIE, AUTH_USER_KEY } from '../auth.constants';

/**
 * Protege les routes avocat. Depose l'utilisateur resolu sur la requete pour
 * que les services filtrent systematiquement par `userId` (isolation tenant).
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const sessionId = request.cookies?.[AUTH_COOKIE];

    if (!sessionId) {
      throw new UnauthorizedException('Session absente ou expiree.');
    }

    const user = await this.auth.resolveSession(sessionId);
    if (!user) {
      throw new UnauthorizedException('Session absente ou expiree.');
    }

    Reflect.set(request, AUTH_USER_KEY, user);
    return true;
  }
}
