import { Global, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { LOGGER_OPTIONS, LoggerOptions, LoggerService } from './logger.service';
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
      useFactory: (config: ConfigService<Env, true>): LoggerOptions => {
        const isProd = config.get('NODE_ENV', { infer: true }) === 'production';
        return {
          serviceName: 'nestjs-starter-application',
          level: config.get('LOG_LEVEL', { infer: true }),
          newRelic: isProd,
        };
      },
      inject: [ConfigService],
    },
    LoggerService,
  ],
  exports: [LoggerService, RequestContext],
})
export class AppLoggerModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationIdMiddleware).forRoutes('{*splat}');
  }
}
