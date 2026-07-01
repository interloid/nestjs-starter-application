import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ConfigService } from '@nestjs/config';
import { doubleCsrf } from 'csrf-csrf';
import { Env } from '../config/env.validation';
import { SKIP_CSRF_KEY } from '../common/decorators/skip-csrf.decorator';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

@Injectable()
export class CsrfGuard implements CanActivate {
  private readonly enabled: boolean;
  private readonly validate?: (req: Request, res: any) => boolean;

  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService<Env, true>,
  ) {
    this.enabled = this.config.get('CSRF_ENABLED', { infer: true });

    if (this.enabled) {
      const secret = this.config.get('CSRF_SECRET', { infer: true });
      if (!secret) throw new Error('CSRF_ENABLED is true but CSRF_SECRET is not set');

      const { validateRequest } = doubleCsrf({
        getSecret: () => secret,
        getSessionIdentifier: (req: Request) => req.ip ?? '',
        cookieName: 'x-csrf-token',
        cookieOptions: {
          httpOnly: true,
          sameSite: 'lax',
          secure: this.config.get('NODE_ENV', { infer: true }) === 'production',
        },
        getCsrfTokenFromRequest: (req: Request) => req.headers['x-csrf-token'],
      });
      this.validate = validateRequest;
    }
  }

  canActivate(context: ExecutionContext): boolean {
    if (!this.enabled || !this.validate) return true;

    const req = context.switchToHttp().getRequest<Request>();

    if (SAFE_METHODS.has(req.method)) return true;

    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_CSRF_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) return true;

    const res: Response = context.switchToHttp().getResponse();
    if (!this.validate(req, res)) {
      throw new ForbiddenException('Invalid CSRF token');
    }
    return true;
  }
}
