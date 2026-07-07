import { Controller, Get, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { SkipCsrf } from '../common/decorators/skip-csrf.decorator';
import { CsrfService } from './csrf.service';

@Controller('csrf-token')
export class CsrfController {
  constructor(private readonly csrf: CsrfService) {}

  @SkipCsrf()
  @Get()
  getToken(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = this.csrf.generateToken(req, res);
    return { csrfToken: token };
  }
}
