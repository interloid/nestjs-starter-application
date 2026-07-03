import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ZodValidationException } from 'nestjs-zod';
import { RequestContext } from '../context/request-context';
import { LoggerService } from '../../logger/logger.service';
import { ApiError, ApiResponse } from '../response/api-response';
import { ZodError } from 'zod';

@Injectable()
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(
    private readonly ctx: RequestContext,
    private readonly logger: LoggerService,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const httpCtx = host.switchToHttp();
    const req = httpCtx.getRequest<Request>();
    const res = httpCtx.getResponse<Response>();

    const { status, message, errors } = this.normalize(exception);

    if (status >= 500) {
      this.logger.error(message, exception instanceof Error ? exception : undefined);
    } else {
      this.logger.warn(message, { statusCode: status });
    }

    const body = ApiResponse.error({ statusCode: status, message, errors });
    body.path = req.originalUrl;
    body.requestId = this.ctx.get('requestId');

    res.status(status).json(body);
  }

  private normalize(exception: unknown): {
    status: number;
    message: string;
    errors?: ApiError[];
  } {
    if (exception instanceof ZodValidationException) {
      const zodError = exception.getZodError() as ZodError;
      const errors: ApiError[] = zodError.issues.map((issue) => ({
        field: issue.path.join('.') || undefined,
        message: issue.message,
        code: issue.code,
      }));
      return { status: HttpStatus.BAD_REQUEST, message: 'Validation failed', errors };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const resp = exception.getResponse();
      let message = exception.message;
      let errors: ApiError[] | undefined;

      if (typeof resp === 'object' && resp !== null) {
        const r = resp as { message?: string | string[] };
        if (Array.isArray(r.message)) {
          errors = r.message.map((m) => ({ message: m }));
          message = 'Request failed';
        } else if (typeof r.message === 'string') {
          message = r.message;
        }
      }
      return { status, message, errors };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
    };
  }
}
