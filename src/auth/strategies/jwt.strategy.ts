import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Env } from '../../config/env.validation';
import { UserService } from '../../user/user.service';
import { JwtPayload } from '../services/token.service';
import type { Request } from 'express';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService<Env, true>,
    private readonly users: UserService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request) => {
          const token = req.cookies?.['access_token'] as string | undefined;
          return token ?? null;
        },
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: config.get('JWT_ACCESS_SECRET', { infer: true }),
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.users.findByIdWithRoles(payload.sub);

    if (!user || user.deletedAt || user.status === false) {
      throw new UnauthorizedException('Unauthorized access');
    }

    const permissions = user.roles.flatMap((ur) =>
      ur.role.permissions.map((rp) => rp.permission.name),
    );
    const roles = user.roles.map((ur) => ur.role.name);

    return {
      id: user.id,
      email: user.email,
      status: user.status,
      roles,
      permissions,
    };
  }
}
