import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { AppLoggerModule } from './logger/logger.module';
import { APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { LoggingInterceptor } from './logger/logging.interceptor';
import { ZodValidationPipe } from 'nestjs-zod';
import { ThrottlerModule, ThrottlerGuard, seconds, minutes } from '@nestjs/throttler';
import { CsrfGuard } from './csrf/csrf.guard';
import { CsrfController } from './csrf/csrf.controller';
import { CsrfService } from './csrf/csrf.service';
import { HealthModule } from './observability/health/health.module';

@Module({
  imports: [
    ConfigModule,
    AppLoggerModule,
    HealthModule,
    ThrottlerModule.forRoot({
      throttlers: [
        { name: 'short', ttl: seconds(1), limit: 3 },
        { name: 'medium', ttl: seconds(10), limit: 20 },
        { name: 'default', ttl: minutes(1), limit: 100 },
      ],
    }),
  ],
  controllers: [CsrfController],

  providers: [
    CsrfService,
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
  ],
})
export class AppModule {}
