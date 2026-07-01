import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { VersionService } from './version.service';

@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
  providers: [VersionService],
})
export class HealthModule {}
