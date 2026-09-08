import { Module } from '@nestjs/common';
import { PublicDepositController } from './public-deposit.controller';
import { PublicDepositService } from './public-deposit.service';
import { DepositSessionGuard } from './guards/deposit-session.guard';

@Module({
  controllers: [PublicDepositController],
  providers: [PublicDepositService, DepositSessionGuard],
  exports: [PublicDepositService],
})
export class PublicDepositModule {}
