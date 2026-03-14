import { RolesGuard } from './roles.guard';
import { Reflector } from '@nestjs/core';
import { ForbiddenException } from '@nestjs/common';

function makeContext(method: string, role: string) {
  const request = { method, user: { role, permissions: [] } };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as any;
}

describe('RolesGuard – GUEST enforcement', () => {
  let guard: RolesGuard;

  beforeEach(() => {
    const reflector = { getAllAndOverride: () => null } as any;
    guard = new RolesGuard(reflector);
  });

  const writeMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];

  writeMethods.forEach((method) => {
    it(`should throw ForbiddenException for GUEST on ${method}`, () => {
      expect(() => guard.canActivate(makeContext(method, 'GUEST'))).toThrow(
        ForbiddenException,
      );
    });
  });

  it('should allow GUEST on GET', () => {
    const result = guard.canActivate(makeContext('GET', 'GUEST'));
    expect(result).toBe(true);
  });

  it('should allow USER on POST (no @Roles restriction)', () => {
    const result = guard.canActivate(makeContext('POST', 'USER'));
    expect(result).toBe(true);
  });
});
