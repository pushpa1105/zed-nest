import { Controller, Get, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../../core/security/public.decorator.js';
import { DatabaseHealthIndicator } from './database.health.js';

/**
 * Kubernetes-style probes:
 *  - liveness  → is the process alive? (never checks dependencies, or a DB blip restarts every pod)
 *  - readiness → can this instance serve traffic? (checks DB and other hard dependencies)
 */
@ApiTags('Health')
@Public()
@SkipThrottle()
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly database: DatabaseHealthIndicator,
  ) {}

  @Get('live')
  @ApiOperation({ summary: 'Liveness probe' })
  @HealthCheck()
  live() {
    return this.health.check([]);
  }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness probe (checks dependencies)' })
  @HealthCheck()
  ready() {
    return this.health.check([() => this.database.check('database')]);
  }
}
