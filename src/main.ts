import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger as NestLogger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Env } from './config/env.validation';
import { LoggerService } from './logger/logger.service';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { cleanupOpenApiDoc } from 'nestjs-zod';

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

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Production Ready API')
    .setVersion('1.0')
    .build();

  let document = SwaggerModule.createDocument(app, swaggerConfig);

  document = cleanupOpenApiDoc(document, { version: 'auto' });

  SwaggerModule.setup('api/docs', app, document);

  await app.listen(config.get('PORT', { infer: true }));
}
bootstrap().catch((err) => {
  logger.error(err);
  process.exit(1);
});
