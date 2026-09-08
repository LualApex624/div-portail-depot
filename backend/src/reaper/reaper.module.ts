import { Module } from '@nestjs/common';
import { ReaperService } from './reaper.service';

@Module({
  providers: [ReaperService],
  exports: [ReaperService],
})
export class ReaperModule {}
