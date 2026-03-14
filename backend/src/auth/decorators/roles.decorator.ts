import { SetMetadata } from '@nestjs/common';
export const ROLES_KEY = 'roles';

/**
 * Decorator to specify required roles for a route.
 * Use with RolesGuard.
 *
 * @example
 * @Roles('ADMIN')
 * @UseGuards(JwtAuthGuard, RolesGuard)
 * async adminOnly() { ... }
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
