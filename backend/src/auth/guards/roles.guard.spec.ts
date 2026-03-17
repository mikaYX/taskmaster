import { RolesGuard } from './roles.guard';
import { Reflector } from '@nestjs/core';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Permission } from '../permissions.enum';
import { Role } from '../../enums/role.enum';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn(),
    } as any as Reflector;
    guard = new RolesGuard(reflector);
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  describe('when using @RequirePermission', () => {
    it('should allow if user has permission (ADMIN has TASK_DELETE)', () => {
      (reflector.getAllAndOverride as jest.Mock)
        .mockReturnValueOnce([Permission.TASK_DELETE])
        .mockReturnValueOnce(null);
      const context = {
        getHandler: jest.fn(),
        getClass: jest.fn(),
        switchToHttp: () => ({
          getRequest: () => ({
            user: { role: Role.SUPER_ADMIN },
          }),
        }),
      } as any as ExecutionContext;

      expect(guard.canActivate(context)).toBe(true);
    });

    it('should allow if user has permission (USER has TASK_READ)', () => {
      (reflector.getAllAndOverride as jest.Mock)
        .mockReturnValueOnce([Permission.TASK_READ])
        .mockReturnValueOnce(null);
      const context = {
        getHandler: jest.fn(),
        getClass: jest.fn(),
        switchToHttp: () => ({
          getRequest: () => ({
            user: { role: Role.USER },
          }),
        }),
      } as any as ExecutionContext;

      expect(guard.canActivate(context)).toBe(true);
    });

    it('should deny if user lacks permission (USER tries TASK_DELETE)', () => {
      (reflector.getAllAndOverride as jest.Mock)
        .mockReturnValueOnce([Permission.TASK_DELETE])
        .mockReturnValueOnce(null);
      const context = {
        getHandler: jest.fn(),
        getClass: jest.fn(),
        switchToHttp: () => ({
          getRequest: () => ({
            user: { role: Role.USER },
          }),
        }),
      } as any as ExecutionContext;

      // Role.USER does NOT have TASK_DELETE in config
      expect(guard.canActivate(context)).toBe(false);
    });

    it('should throw Forbidden if user has no role', () => {
      (reflector.getAllAndOverride as jest.Mock)
        .mockReturnValueOnce([Permission.TASK_READ])
        .mockReturnValueOnce(null);
      const context = {
        getHandler: jest.fn(),
        getClass: jest.fn(),
        switchToHttp: () => ({
          getRequest: () => ({
            user: {}, // No role
          }),
        }),
      } as any as ExecutionContext;

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });
  });

  describe('when using @Roles (Legacy Fallback)', () => {
    it('should use legacy check if no permissions required', () => {
      // Mock permissions check to return null
      (reflector.getAllAndOverride as jest.Mock)
        .mockReturnValueOnce(null) // Permissions Check
        .mockReturnValueOnce([Role.SUPER_ADMIN]); // Roles Check

      const context = {
        getHandler: jest.fn(),
        getClass: jest.fn(),
        switchToHttp: () => ({
          getRequest: () => ({
            user: { role: Role.SUPER_ADMIN },
          }),
        }),
      } as any as ExecutionContext;

      expect(guard.canActivate(context)).toBe(true);
    });

    it('should deny if role mismatch', () => {
      (reflector.getAllAndOverride as jest.Mock)
        .mockReturnValueOnce(null)
        .mockReturnValueOnce([Role.SUPER_ADMIN]);

      const context = {
        getHandler: jest.fn(),
        getClass: jest.fn(),
        switchToHttp: () => ({
          getRequest: () => ({
            user: { role: Role.USER },
          }),
        }),
      } as any as ExecutionContext;

      expect(guard.canActivate(context)).toBe(false);
    });
  });
});
