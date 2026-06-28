import {
  Controller,
  Get,
  ServiceUnavailableException,
  Version,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('health/liveness')
  @Version(VERSION_NEUTRAL)
  @SkipThrottle()
  getLiveness() {
    return { status: 'ok' };
  }

  @Get('health/readiness')
  @Version(VERSION_NEUTRAL)
  @SkipThrottle()
  async getReadiness() {
    const health = await this.appService.checkReadiness();
    if (health.status !== 'ok') {
      throw new ServiceUnavailableException(health);
    }
    return health;
  }
}
