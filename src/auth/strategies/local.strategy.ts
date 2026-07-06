import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-local';
import { User } from '@prisma/client';
import { UserService } from '../../user/user.service';
import { PasswordService } from '../services/password.service';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly users: UserService,
    private readonly password: PasswordService,
  ) {
    super({ usernameField: 'email', passwordField: 'password' });
  }

  async validate(email: string, plainPassword: string): Promise<User> {
    const user = await this.users.findByEmailWithPassword(email);

    if (!user || !(await this.password.verify(user.passwordHash, plainPassword))) {
      throw new UnauthorizedException('Invalid credentials');
    }
    if (user.emailVerified === false) {
      throw new BadRequestException('Email is not verified');
    }

    if (user.status === false) {
      throw new UnauthorizedException('Account is inactive');
    }

    return user;
  }
}
