import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { Request } from 'express';

@Injectable()
export class FileToBodyInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const ctx = context.switchToHttp();
    const req = ctx.getRequest<Request & { file?: Express.Multer.File }>();

    if (req.file) {
      (req.body as Record<string, unknown>).profileImage = req.file;
    }

    return next.handle();
  }
}
