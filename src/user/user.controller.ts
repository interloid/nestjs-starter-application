import { Controller, Get } from '@nestjs/common';
import { UserService } from './user.service';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ApiBearerAuth } from '@nestjs/swagger';
import { RequirePermission } from '../common/decorators/require-permission.decorator';

@Controller('users')
export class UserController {
  constructor(private readonly users: UserService) {}

  @Get('me')
  @ApiBearerAuth('JWT-auth')
  async me(@CurrentUser() user: AuthenticatedUser) {
    const profile = await this.users.findById(user.id);
    const { passwordHash, deletedAt, ...safe } = profile;
    return {
      ...safe,
      roles: user.roles,
      permissions: user.permissions,
    };
  }

  @Get()
  @ApiBearerAuth('JWT-auth')
  @RequirePermission('user:read')
  async getAll() {
    return await this.users.findAll();
  }
}
