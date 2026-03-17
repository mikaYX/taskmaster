import { SetMetadata } from '@nestjs/common';
import { Permission } from '../permissions.enum';

/**
 * Decorator to specify required scopes for an endpoint.
 *
 * Used with ScopesGuard to enforce API key scope-based authorization.
 * For JWT-authenticated users, scope checks are skipped (they use role-based access).
 *
 * @example
 *   @RequireScopes(Permission.TASK_CREATE, Permission.TASK_UPDATE)
 *   @Post('webhook')
 *   async processWebhook() { ... }
 */
export const SCOPES_KEY = 'required_scopes';
export const RequireScopes = (...scopes: Permission[]) =>
  SetMetadata(SCOPES_KEY, scopes);
