import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';
import { ClsService } from 'nestjs-cls';
import { Reflector } from '@nestjs/core';
import { AuthService } from '../auth.service';

// Mock AuthGuard correctly
jest.mock('@nestjs/passport', () => {
    return {
        AuthGuard: jest.fn().mockImplementation(() => {
            return class MockAuthGuard {
                async canActivate() { return true; }
            };
        }),
    };
});

describe('JwtAuthGuard Passkey Enforcement', () => {
    let guard: JwtAuthGuard;
    let clsService: jest.Mocked<ClsService>;
    let reflector: jest.Mocked<Reflector>;
    let authService: jest.Mocked<AuthService>;

    beforeEach(() => {
        clsService = { set: jest.fn() } as any;
        reflector = { getAllAndOverride: jest.fn() } as any;
        authService = { getSession: jest.fn() } as any;

        guard = new JwtAuthGuard(clsService, reflector, authService);
    });

    const mockExecutionContext = (user?: any, headers: any = {}) => ({
        switchToHttp: () => ({
            getRequest: () => ({ user, headers }),
        }),
        getHandler: jest.fn(),
        getClass: jest.fn(),
    } as unknown as ExecutionContext);

    it('should allow access if passkeys are optional', async () => {
        reflector.getAllAndOverride.mockReturnValue(false); // not exempt
        authService.getSession.mockResolvedValue({
            passkeyPolicy: 'optional',
            hasPasskey: false,
        } as any);

        const context = mockExecutionContext({ sub: 1 });
        const result = await guard.canActivate(context);
        expect(result).toBe(true);
    });

    it('should throw ForbiddenException if policy is required and user has no passkey', async () => {
        reflector.getAllAndOverride.mockReturnValue(false); // not exempt
        authService.getSession.mockResolvedValue({
            passkeyPolicy: 'required',
            hasPasskey: false,
        } as any);

        const context = mockExecutionContext({ sub: 1 });
        await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
        await expect(guard.canActivate(context)).rejects.toThrow('Passkey configuration is required');
    });

    it('should allow access if policy is required but user has passkey', async () => {
        reflector.getAllAndOverride.mockReturnValue(false); // not exempt
        authService.getSession.mockResolvedValue({
            passkeyPolicy: 'required',
            hasPasskey: true,
        } as any);

        const context = mockExecutionContext({ sub: 1 });
        const result = await guard.canActivate(context);
        expect(result).toBe(true);
    });

    it('should allow access to exempt routes even if passkey is required', async () => {
        reflector.getAllAndOverride.mockReturnValue(true); // IS EXEMPT!
        const context = mockExecutionContext({ sub: 1 });
        const result = await guard.canActivate(context);
        expect(result).toBe(true);
        expect(authService.getSession).not.toHaveBeenCalled();
    });
});
