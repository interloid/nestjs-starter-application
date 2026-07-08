import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { VersionService } from './version.service';
import { PrismaHealthIndicator } from './prisma.health';

@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
  providers: [VersionService, PrismaHealthIndicator],
})
export class HealthModule {}
