import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import { Request } from 'express';
import { AUTH_USER_KEY } from './auth.constants';
import { AuthenticatedUser } from './auth.service';

/** Avocat authentifie, tel que resolu par AuthGuard. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context.switchToHttp().getRequest<Request>();
    return Reflect.get(request, AUTH_USER_KEY) as AuthenticatedUser;
  },
);
