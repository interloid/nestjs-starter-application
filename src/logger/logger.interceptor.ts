import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';
import { LoggerService } from './logger.service';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(private readonly logger: LoggerService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const start = Date.now();

    return next.handle().pipe(
      tap({
        next: () => this.write(req, res, start),
        error: () => this.write(req, res, start),
      }),
    );
  }

  private write(req: Request, res: Response, start: number): void {
    const responseTimeMs = Date.now() - start;
    const logMessage = `${req.method} ${req.originalUrl} ${res.statusCode} - ${responseTimeMs}ms`;
    this.logger.info(logMessage, {
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      responseTimeMs: Date.now() - start,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }
}
