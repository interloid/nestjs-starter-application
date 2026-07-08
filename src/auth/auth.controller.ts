import {
  Body,
  Controller,
  Post,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
  Res,
  UnauthorizedException,
  Patch,
  Param,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { Throttle, seconds } from '@nestjs/throttler';
import { User } from '@prisma/client';
import { AssignRoleDto, LoginDto, RefreshDto, RegisterDto, VerifyEmailDto } from './dto/auth.dto';
import { Public } from '../common/decorators/public.decorator';
import type { AuthenticatedUser } from './interfaces/authenticated-user.interface';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { Response } from 'express';
import { ForgotPasswordDto, ResetPasswordDto } from './dto/password.dto';
import { ConfigService } from '@nestjs/config';
import { Env } from '../config/env.validation';
import { SkipCsrf } from '../common/decorators/skip-csrf.decorator';
import { ApiBearerAuth } from '@nestjs/swagger';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { TokenService } from './services/token.service';

@Controller('auth')
@SkipCsrf()
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService<Env, true>,
    private readonly tokenService: TokenService,
  ) {}

  @Public()
  @Throttle({ default: { limit: 3, ttl: seconds(3600) } })
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: seconds(60) } })
  @UseGuards(AuthGuard('local'))
  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(
    @Body() _loginDto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.login(req.user as User, {
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip,
    });
    const cookieAuth = this.config.get('COOKIE_AUTH', { infer: true });
    if (cookieAuth) {
      res.cookie('access_token', result.accessToken, {
        httpOnly: true,
        secure: this.config.get('NODE_ENV', { infer: true }) === 'production',
        sameSite: 'lax',
        maxAge: this.tokenService.ttlToMs(this.config.get('JWT_ACCESS_TTL', { infer: true })),
      });
      res.cookie('refresh_token', result.refreshToken, {
        httpOnly: true,
        secure: this.config.get('NODE_ENV', { infer: true }) === 'production',
        sameSite: 'lax',
        path: '/api/v1/auth/refresh',
        maxAge: this.tokenService.ttlToMs(this.config.get('JWT_REFRESH_TTL', { infer: true })),
      });
      return { user: result.user };
    } else {
      return { ...result };
    }
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: seconds(60) } })
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  refresh(@Body() dto: RefreshDto, @Req() req: Request) {
    const cookieAuth = this.config.get('COOKIE_AUTH', { infer: true });

    const refreshToken = cookieAuth
      ? (req.cookies['refresh_token'] as string) || undefined
      : dto.refreshToken;
    if (!refreshToken) throw new UnauthorizedException('Refresh token is missing');
    return this.auth.refresh(refreshToken, {
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip,
    });
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('verify-email')
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.auth.verifyEmail(dto.token);
  }

  @Public()
  @Throttle({ default: { limit: 3, ttl: seconds(3600) } })
  @HttpCode(HttpStatus.OK)
  @Post('forgot-password')
  forgot(@Body() dto: ForgotPasswordDto) {
    return this.auth.forgotPassword(dto.email);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: seconds(3600) } })
  @HttpCode(HttpStatus.OK)
  @Post('reset-password')
  reset(@Body() dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto.token, dto.password);
  }

  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT-auth')
  @Post('logout')
  async logout(
    @Body() dto: RefreshDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const cookieAuth = this.config.get('COOKIE_AUTH', { infer: true });

    const refreshToken = cookieAuth
      ? (req.cookies?.['refresh_token'] as string | undefined)
      : dto.refreshToken;

    if (refreshToken) {
      await this.auth.logout(refreshToken);
    }

    if (cookieAuth) {
      res.clearCookie('access_token');
      res.clearCookie('refresh_token', { path: '/api/v1/auth/refresh' });
    }

    return { success: true };
  }

  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT-auth')
  @Post('logout-all')
  logoutAll(@CurrentUser() user: AuthenticatedUser) {
    return this.auth.logoutAll(user.id);
  }

  @RequirePermission('users:manage')
  @Patch(':id/roles')
  assignRole(@Param('id') id: string, @Body() dto: AssignRoleDto) {
    return this.auth.assignRole(id, dto.role);
  }
}
