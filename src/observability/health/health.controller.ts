import { Controller, Get, VERSION_NEUTRAL } from '@nestjs/common';
import { HealthCheck, HealthCheckService, MemoryHealthIndicator } from '@nestjs/terminus';
import { SkipThrottle } from '@nestjs/throttler';
import { SkipCsrf } from '../../common/decorators/skip-csrf.decorator';
import { VersionService } from './version.service';
import { Public } from '../../common/decorators/public.decorator';

@SkipThrottle()
@Public()
@SkipCsrf()
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly memory: MemoryHealthIndicator,
    private readonly version: VersionService,
  ) {}

  @Get('live')
  @HealthCheck()
  liveness() {
    return this.health.check([]);
  }

  @Get('ready')
  @HealthCheck()
  async eadiness() {
    const result = await this.health.check([
      () => this.memory.checkHeap('memory_heap', 300 * 1024 * 1024),
      () => this.memory.checkRSS('memory_rss', 400 * 1024 * 1024),
    ]);
    return { ...result, version: this.version.info };
  }
}
