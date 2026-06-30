import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { AppLoggerModule } from './logger/logger.module';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { LoggingInterceptor } from './logger/logging.interceptor';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [ConfigModule, AppLoggerModule, ScheduleModule.forRoot()],
  providers: [{ provide: APP_INTERCEPTOR, useClass: LoggingInterceptor }],
})
export class AppModule {}
