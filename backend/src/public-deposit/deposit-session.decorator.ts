import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import { Request } from 'express';
import { DEPOSIT_SESSION_KEY } from './public-deposit.constants';
import { DepositSessionContext } from './public-deposit.service';

export const DepositSession = createParamDecorator(
  (_data: unknown, context: ExecutionContext): DepositSessionContext => {
    const request = context.switchToHttp().getRequest<Request>();
    return Reflect.get(request, DEPOSIT_SESSION_KEY) as DepositSessionContext;
  },
);
