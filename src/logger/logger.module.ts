import { Global, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { LOGGER_OPTIONS, LoggerOptions, LoggerService } from './logger.service';
import { RetentionScheduler } from './retention/retention.scheduler';
import { RequestContext } from '../common/context/request-context';
import { CorrelationIdMiddleware } from '../common/middleware/correlation-id.middleware';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Env } from '../config/env.validation';

@Global()
@Module({
  imports: [ConfigModule.forRoot()],
  providers: [
    RequestContext,
    {
      provide: LOGGER_OPTIONS,
      useFactory: (configService: ConfigService<Env>): LoggerOptions => {
        return {
          serviceName: 'nest-kickstart',
          file: {
            directory: configService.get<string>('LOG_DIR', { infer: true }),
            alsoStdout: configService.get<string>('NODE_ENV', { infer: true }) !== 'production',
            cleanupCron: configService.get<string>('LOG_CLEANUP_CRON', { infer: true }),
            retentionDays: configService.get<number>('LOG_RETENTION_DAYS', {
              infer: true,
            }) as number,
          },
        };
      },
      inject: [ConfigService],
    },
    LoggerService,
    RetentionScheduler,
  ],
  exports: [LoggerService, RequestContext],
})
export class AppLoggerModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationIdMiddleware).forRoutes('{*splat}');
  }
}
