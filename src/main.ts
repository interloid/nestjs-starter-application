import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger as NestLogger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Env } from './config/env.validation';
import { LoggerService } from './logger/logger.service';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { VersioningType } from '@nestjs/common';
import { setupSwagger } from './common/swagger/swagger.setup';
import { NestExpressApplication } from '@nestjs/platform-express';

const logger = new NestLogger();

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService<Env, true>);

  if (config.get('APP_ENV', { infer: true }) !== 'local') {
    app.set('trust proxy', 1);
  }
  app.set('trust proxy', 1);

  app.use(cookieParser());

  app.useLogger(app.get(LoggerService));

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

  app.setGlobalPrefix('api', { exclude: ['health/live', 'health/ready'] });

  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  if (config.get('SWAGGER_ENABLED', { infer: true })) {
    setupSwagger(app);
  }

  const port = config.get('PORT', { infer: true });

  const server = await app.listen(port);

  logger.log(`Application successfully listening on port: ${port}`);
  const handleShutdown = (signal: string) => {
    logger.warn(`Received ${signal}. Starting graceful shutdown sequence...`);

    server.close((err) => {
      if (err) {
        logger.error(`Error closing HTTP server connections gracefully:`, err);
        process.exit(1);
      }

      logger.log('HTTP server connections drained. Closing NestJS container...');

      app
        .close()
        .then(() => {
          logger.log('NestJS application destroyed. Safe shutdown complete.');
          process.exit(0);
        })
        .catch((closeErr) => {
          logger.error('Error during NestJS container destruction:', closeErr);
          process.exit(1);
        });
    });
  };

  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  process.on('SIGINT', () => handleShutdown('SIGINT'));
}
bootstrap().catch((err) => {
  logger.error(err);
  process.exit(1);
});
