import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSION_KEY } from '../decorators/require-permission.decorator';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { Request } from 'express';
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const req: Request = context.switchToHttp().getRequest();
    const user = req.user as AuthenticatedUser | undefined;
    if (!user) throw new ForbiddenException('Not authenticated');

    const has = required.every((perm) => this.hasPermission(user.permissions, perm));
    if (!has) throw new ForbiddenException('Insufficient permissions');
    return true;
  }

  private hasPermission(userPermissions: string[], required: string): boolean {
    const [resource] = required.split(':');

    return userPermissions.some((permission) => {
      if (permission === required) return true;

      // user has "users:manage" → satisfies "users:update", "users:delete", etc.
      const [pResource, pAction] = permission.split(':');
      if (pResource === resource && pAction === 'manage') return true;

      return false;
    });
  }
}
