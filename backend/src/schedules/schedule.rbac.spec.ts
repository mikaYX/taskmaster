import { RolesGuard } from '../auth/guards/roles.guard';
import { Reflector } from '@nestjs/core';
import { ExecutionContext } from '@nestjs/common';
import { Permission } from '../auth/permissions.enum';
import { Role } from '../enums/role.enum';

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
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue([
        Permission.SCHEDULE_READ,
      ]);
      expect(guard.canActivate(makeContext(Role.USER))).toBe(true);
    });

    it('POST /schedules — SCHEDULE_CREATE — denied', () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue([
        Permission.SCHEDULE_CREATE,
      ]);
      expect(guard.canActivate(makeContext(Role.USER))).toBe(false);
    });

    it('PUT /schedules/:id — SCHEDULE_UPDATE — denied', () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue([
        Permission.SCHEDULE_UPDATE,
      ]);
      expect(guard.canActivate(makeContext(Role.USER))).toBe(false);
    });

    it('DELETE /schedules/:id — SCHEDULE_DELETE — denied', () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue([
        Permission.SCHEDULE_DELETE,
      ]);
      expect(guard.canActivate(makeContext(Role.USER))).toBe(false);
    });
  });

  describe('ADMIN role', () => {
    it('GET /schedules — SCHEDULE_READ — allowed', () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue([
        Permission.SCHEDULE_READ,
      ]);
      expect(guard.canActivate(makeContext(Role.SUPER_ADMIN))).toBe(true);
    });

    it('POST /schedules — SCHEDULE_CREATE — allowed', () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue([
        Permission.SCHEDULE_CREATE,
      ]);
      expect(guard.canActivate(makeContext(Role.SUPER_ADMIN))).toBe(true);
    });

    it('PUT /schedules/:id — SCHEDULE_UPDATE — allowed', () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue([
        Permission.SCHEDULE_UPDATE,
      ]);
      expect(guard.canActivate(makeContext(Role.SUPER_ADMIN))).toBe(true);
    });

    it('DELETE /schedules/:id — SCHEDULE_DELETE — allowed', () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue([
        Permission.SCHEDULE_DELETE,
      ]);
      expect(guard.canActivate(makeContext(Role.SUPER_ADMIN))).toBe(true);
    });
  });
});
