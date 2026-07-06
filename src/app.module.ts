import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { AppLoggerModule } from './logger/logger.module';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { LoggingInterceptor } from './logger/logging.interceptor';
import { ZodValidationPipe } from 'nestjs-zod';
import { ThrottlerModule, ThrottlerGuard, seconds, minutes } from '@nestjs/throttler';
import { CsrfGuard } from './csrf/csrf.guard';
import { CsrfController } from './csrf/csrf.controller';
import { CsrfService } from './csrf/csrf.service';
import { HealthModule } from './observability/health/health.module';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { UserModule } from './user/user.module';
import { PermissionsGuard } from './common/guards/permission.guard';
import { MailModule } from './mail/mail.module';
import { QueueModule } from './queue/queue.module';
import { UploadModule } from './upload/upload.module';

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
    PrismaModule,
    UserModule,
    AuthModule,
    QueueModule,
    MailModule,
    UploadModule,
  ],
  controllers: [CsrfController],

  providers: [
    CsrfService,
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
