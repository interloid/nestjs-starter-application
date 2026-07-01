import { randomUUID } from 'node:crypto';
import { Injectable, NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { RequestContext, RequestStore } from '../context/request-context';

export const CORRELATION_ID_HEADER = 'x-correlation-id';
export const REQUEST_ID_HEADER = 'x-request-id';

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  constructor(private readonly ctx: RequestContext) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const correlationId = this.headerOrNew(req, CORRELATION_ID_HEADER);
    const requestId = this.headerOrNew(req, REQUEST_ID_HEADER);

    res.setHeader(CORRELATION_ID_HEADER, correlationId);
    res.setHeader(REQUEST_ID_HEADER, requestId);

    const store: RequestStore = new Map();
    store.set('correlationId', correlationId);
    store.set('requestId', requestId);

    this.ctx.run(store, () => next());
  }

  private headerOrNew(req: Request, header: string): string {
    const value = req.headers[header];
    if (typeof value === 'string' && value.length > 0) return value;
    if (Array.isArray(value) && value.length > 0) return value[0];
    return randomUUID();
  }
}
