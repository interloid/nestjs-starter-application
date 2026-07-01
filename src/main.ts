import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger as NestLogger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Env } from './config/env.validation';
import { LoggerService } from './logger/logger.service';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';

const logger = new NestLogger();

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.use(cookieParser());

  app.useLogger(app.get(LoggerService));
  const config = app.get(ConfigService<Env, true>);

  app.use(helmet());

  const origins = config
    .get('CORS_ORIGINS', { infer: true })
    .split(',')
    .map((origin) => origin.trim());

  app.enableCors({
    origin: origins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-correlation-id', 'x-request-id'],
    exposedHeaders: ['x-correlation-id', 'x-request-id'],
  });

  await app.listen(config.get('PORT', { infer: true }));
}
bootstrap().catch((err) => {
  logger.error(err);
  process.exit(1);
});
