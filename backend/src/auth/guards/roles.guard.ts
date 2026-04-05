import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { PERMISSIONS_KEY } from '../decorators/require-permission.decorator';
import { Role } from '../../enums/role.enum';
import { Permission } from '../permissions.enum';
import { ROLE_PERMISSIONS } from '../role-permissions.config';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const { user } = request;

    // Fast-fail: Guest users are strictly read-only
    if (
      user?.role === 'GUEST' &&
      ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)
    ) {
      throw new ForbiddenException('Guest users have read-only access.');
    }
    // 1. Check for required Permissions first (V2)
    const requiredPermissions = this.reflector.getAllAndOverride<Permission[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (requiredPermissions && requiredPermissions.length > 0) {
      if (!user || (!user.role && !user.permissions)) {
        throw new ForbiddenException('User role or permissions not found');
      }

      // Resolve user permissions: Check direct permissions (API Key) or resolve from role (User)
      const userPermissions =
        user.permissions || ROLE_PERMISSIONS[user.role] || [];

      // Check if user has ALL required permissions
      const hasAllPermissions = requiredPermissions.every((permission) =>
        userPermissions.includes(permission),
      );

      if (!hasAllPermissions) {
        // Strict V2 failure
        return false;
      }
      // Continue to role check if permissions pass
    }

    // 2. Fallback to Legacy Roles Check (V1)
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles) {
      return true; // No restrictions
    }

    if (!user) {
      throw new ForbiddenException('No user found');
    }
    return requiredRoles.some((role) => user.role === role);
  }
}
