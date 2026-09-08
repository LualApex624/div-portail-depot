import { Controller, Get, Header } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { MetricsService } from './metrics.service';

@Controller()
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @SkipThrottle()
  @Get('metrics')
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  async scrape(): Promise<string> {
    return this.metrics.render();
  }
}
