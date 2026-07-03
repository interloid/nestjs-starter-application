import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { Observable, map } from 'rxjs';
import { RAW_RESPONSE_KEY } from '../decorators/raw-response.decorator';
import { RequestContext } from '../context/request-context';
import { ApiResponse } from '../response/api-response';

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, unknown> {
  constructor(
    private readonly reflector: Reflector,
    private readonly ctx: RequestContext,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const raw = this.reflector.getAllAndOverride<boolean>(RAW_RESPONSE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (raw) return next.handle();

    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();

    return next.handle().pipe(
      map((payload): ApiResponse<unknown> => {
        if (payload instanceof ApiResponse) {
          payload.path = req.originalUrl;
          payload.requestId = this.ctx.get('requestId');
          return payload;
        }

        const response = ApiResponse.success({
          data: payload,
          statusCode: res.statusCode,
        });
        response.path = req.originalUrl;
        response.requestId = this.ctx.get('requestId');
        return response;
      }),
    );
  }
}
