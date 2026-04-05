import { LocalNetworkGuard } from './local-network.guard';
import { ConfigService } from '@nestjs/config';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Request } from 'express';

describe('LocalNetworkGuard', () => {
  let guard: LocalNetworkGuard;
  let mockConfigService: jest.Mocked<ConfigService>;
  let mockExecutionContext: jest.Mocked<ExecutionContext>;
  let mockRequest: any;

  beforeEach(() => {
    mockConfigService = {
      get: jest.fn(),
    } as unknown as jest.Mocked<ConfigService>;

    guard = new LocalNetworkGuard(mockConfigService);

    mockRequest = {
      ip: '',
      socket: { remoteAddress: '' } as any,
    };

    const mockHttpArgumentsHost = {
      getRequest: jest.fn().mockReturnValue(mockRequest),
    };

    mockExecutionContext = {
      switchToHttp: jest.fn().mockReturnValue(mockHttpArgumentsHost),
    } as unknown as jest.Mocked<ExecutionContext>;
  });

  describe('canActivate', () => {
    it('should throw ForbiddenException if IP cannot be determined', () => {
      expect(() => guard.canActivate(mockExecutionContext)).toThrow(
        ForbiddenException,
      );
    });

    it('should allow access from IPv4 loopback (127.0.0.1)', () => {
      mockRequest.ip = '127.0.0.1';
      expect(guard.canActivate(mockExecutionContext)).toBe(true);
    });

    it('should allow access from IPv6 loopback (::1)', () => {
      mockRequest.ip = '::1';
      expect(guard.canActivate(mockExecutionContext)).toBe(true);
    });

    it('should allow access from IPv4-mapped IPv6 loopback (::ffff:127.0.0.1)', () => {
      mockRequest.ip = '::ffff:127.0.0.1';
      expect(guard.canActivate(mockExecutionContext)).toBe(true);
    });

    it('should deny access from external IP by default', () => {
      mockRequest.ip = '203.0.113.1'; // Documentation IP block
      expect(() => guard.canActivate(mockExecutionContext)).toThrow(
        ForbiddenException,
      );
    });

    it('should use socket.remoteAddress if req.ip is undefined', () => {
      mockRequest.ip = undefined;
      (mockRequest.socket as any).remoteAddress = '127.0.0.1';
      expect(guard.canActivate(mockExecutionContext)).toBe(true);
    });

    it('should allow extra IPs provided via MONITORING_ALLOW_IPS', () => {
      mockRequest.ip = '10.0.0.50';
      mockConfigService.get.mockReturnValue('192.168.1.1, 10.0.0.50');

      expect(guard.canActivate(mockExecutionContext)).toBe(true);
    });

    it('should still deny IPs not present in MONITORING_ALLOW_IPS', () => {
      mockRequest.ip = '10.0.0.51';
      mockConfigService.get.mockReturnValue('192.168.1.1, 10.0.0.50');

      expect(() => guard.canActivate(mockExecutionContext)).toThrow(
        ForbiddenException,
      );
    });
  });
});
