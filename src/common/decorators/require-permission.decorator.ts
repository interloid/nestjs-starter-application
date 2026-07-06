import { SetMetadata } from '@nestjs/common';

export const PERMISSION_KEY = 'requiredPermissions';
export const RequirePermission = (...permissions: string[]) =>
  SetMetadata(PERMISSION_KEY, permissions);
