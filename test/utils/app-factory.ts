import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, VersioningType } from '@nestjs/common';
import { AppModule } from '../../src/app.module';
import { CsrfGuard } from '../../src/csrf/csrf.guard';
import { ThrottlerGuard } from '@nestjs/throttler';
import cookieParser from 'cookie-parser';
import { ZodValidationPipe } from 'nestjs-zod';

export async function createE2eApp(): Promise<{ app: INestApplication; moduleRef: TestingModule }> {
  const moduleBuilder = Test.createTestingModule({
    imports: [AppModule],
  });

  // Neutralize rate limit engines and CSRF tokens across all E2E validations
  moduleBuilder
    .overrideGuard(ThrottlerGuard)
    .useValue({ canActivate: () => true })
    .overrideGuard(CsrfGuard)
    .useValue({ canActivate: () => true });

  const moduleRef = await moduleBuilder.compile();
  const app = moduleRef.createNestApplication();

  app.use(cookieParser());
  app.useGlobalPipes(new ZodValidationPipe());
  app.setGlobalPrefix('api', { exclude: ['health/live', 'health/ready'] });
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  await app.init();
  return { app, moduleRef };
}
