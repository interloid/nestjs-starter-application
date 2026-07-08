import { Injectable, InternalServerErrorException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { doubleCsrf } from 'csrf-csrf';
import { Env } from '../config/env.validation';

@Injectable()
export class CsrfService {
  readonly generateToken: (req: Request, res: Response) => string;
  readonly validateRequest: (req: Request) => boolean;
  readonly enabled: boolean;

  constructor(private readonly config: ConfigService<Env, true>) {
    this.enabled = this.config.get('CSRF_ENABLED', { infer: true });
    if (!this.enabled) {
      this.generateToken = () => '';
      this.validateRequest = () => true;
      return;
    }

    const secret = this.config.get('CSRF_SECRET', { infer: true });
    if (!secret) {
      throw new InternalServerErrorException('CSRF_ENABLED is true but CSRF_SECRET is not set');
    }

    const { generateCsrfToken, validateRequest } = doubleCsrf({
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

    this.generateToken = generateCsrfToken;
    this.validateRequest = validateRequest;
  }
}
