import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { AppLoggerModule } from './logger/logger.module';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { LoggingInterceptor } from './logger/logging.interceptor';

@Module({
  imports: [ConfigModule, AppLoggerModule],
  providers: [{ provide: APP_INTERCEPTOR, useClass: LoggingInterceptor }],
})
export class AppModule {}
