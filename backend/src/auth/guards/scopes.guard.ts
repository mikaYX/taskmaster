import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SCOPES_KEY } from '../decorators/require-scopes.decorator';
import { Permission } from '../permissions.enum';

/**
 * ScopesGuard — Enforces scope-based authorization for API key users.
 *
 * Behavior:
 * - Reads required scopes from @RequireScopes() decorator metadata
 * - For API key users (role === 'API_KEY'): checks user.permissions against required scopes
 * - For JWT users (regular login): passes through (role-based access is handled by RolesGuard)
 * - Returns 403 with explicit message if any required scope is missing
 */
@Injectable()
export class ScopesGuard implements CanActivate {
  private readonly logger = new Logger('ScopesGuard');

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Read required scopes from decorator
    const requiredScopes = this.reflector.getAllAndOverride<Permission[]>(
      SCOPES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // No scopes required → pass through
    if (!requiredScopes || requiredScopes.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Authentication required.');
    }

    // JWT users (regular login) → pass through to RolesGuard
    // Only API key users need scope enforcement
    if (user.role !== 'API_KEY') {
      return true;
    }

    // API key users: check scopes
    const userScopes: string[] = user.permissions || [];
    const missingScopes = requiredScopes.filter(
      (scope) => !userScopes.includes(scope),
    );

    if (missingScopes.length > 0) {
      this.logger.warn(
        `[SECURITY] Scope check FAILED — apiKeyId: ${user.id}, ` +
        `required: [${requiredScopes.join(', ')}], ` +
        `missing: [${missingScopes.join(', ')}]`,
      );

      throw new ForbiddenException(
        `Insufficient API key scopes. Missing: ${missingScopes.join(', ')}`,
      );
    }

    this.logger.debug(
      `Scope check passed — apiKeyId: ${user.id}, scopes: [${requiredScopes.join(', ')}]`,
    );

    return true;
  }
}
