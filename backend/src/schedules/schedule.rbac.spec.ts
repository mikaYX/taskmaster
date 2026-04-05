import { RolesGuard } from '../auth/guards/roles.guard';
import { Reflector } from '@nestjs/core';
import { ExecutionContext } from '@nestjs/common';
import { Permission } from '../auth/permissions.enum';
import { Role } from '../enums/role.enum';
import { PERMISSIONS_KEY } from '../auth/decorators/require-permission.decorator';

/**
 * RBAC proof for ScheduleController permissions.
 * Validates that the RolesGuard correctly enforces SCHEDULE_* permissions
 * per role, matching the controller's @RequirePermission decorators.
 */
describe('Schedule RBAC — RolesGuard permission enforcement', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn(),
    } as any as Reflector;
    guard = new RolesGuard(reflector);
  });

  /**
   * Helper: mock reflector to return the given permissions for PERMISSIONS_KEY
   * and undefined for ROLES_KEY (no legacy role restriction).
   */
  function mockPermissions(permissions: Permission[]) {
    (reflector.getAllAndOverride as jest.Mock).mockImplementation(
      (key: string) => {
        if (key === PERMISSIONS_KEY) return permissions;
        return undefined; // ROLES_KEY → no legacy role restriction
      },
    );
  }

  function makeContext(role: Role) {
    return {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({ user: { role } }),
      }),
    } as any as ExecutionContext;
  }

  describe('USER role', () => {
    it('GET /schedules — SCHEDULE_READ — allowed', () => {
      mockPermissions([Permission.SCHEDULE_READ]);
      expect(guard.canActivate(makeContext(Role.USER))).toBe(true);
    });

    it('POST /schedules — SCHEDULE_CREATE — denied', () => {
      mockPermissions([Permission.SCHEDULE_CREATE]);
      expect(guard.canActivate(makeContext(Role.USER))).toBe(false);
    });

    it('PUT /schedules/:id — SCHEDULE_UPDATE — denied', () => {
      mockPermissions([Permission.SCHEDULE_UPDATE]);
      expect(guard.canActivate(makeContext(Role.USER))).toBe(false);
    });

    it('DELETE /schedules/:id — SCHEDULE_DELETE — denied', () => {
      mockPermissions([Permission.SCHEDULE_DELETE]);
      expect(guard.canActivate(makeContext(Role.USER))).toBe(false);
    });
  });

  describe('ADMIN role', () => {
    it('GET /schedules — SCHEDULE_READ — allowed', () => {
      mockPermissions([Permission.SCHEDULE_READ]);
      expect(guard.canActivate(makeContext(Role.SUPER_ADMIN))).toBe(true);
    });

    it('POST /schedules — SCHEDULE_CREATE — allowed', () => {
      mockPermissions([Permission.SCHEDULE_CREATE]);
      expect(guard.canActivate(makeContext(Role.SUPER_ADMIN))).toBe(true);
    });

    it('PUT /schedules/:id — SCHEDULE_UPDATE — allowed', () => {
      mockPermissions([Permission.SCHEDULE_UPDATE]);
      expect(guard.canActivate(makeContext(Role.SUPER_ADMIN))).toBe(true);
    });

    it('DELETE /schedules/:id — SCHEDULE_DELETE — allowed', () => {
      mockPermissions([Permission.SCHEDULE_DELETE]);
      expect(guard.canActivate(makeContext(Role.SUPER_ADMIN))).toBe(true);
    });
  });
});
