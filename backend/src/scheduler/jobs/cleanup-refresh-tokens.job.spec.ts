import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma';
import { AuditService } from '../../audit/audit.service';
import { CleanupRefreshTokensJob } from './cleanup-refresh-tokens.job';

/**
 * Tests for AUDIT.md Finding #9 — refresh token retention.
 *
 * Mirrors `CleanupAuditLogsJob` but with the two-condition WHERE clause
 * (expired OR revoked-too-long-ago).
 */
describe('CleanupRefreshTokensJob', () => {
  let job: CleanupRefreshTokensJob;
  let findMany: jest.Mock;
  let deleteMany: jest.Mock;
  let auditLog: jest.Mock;
  let originalEnv: string | undefined;

  beforeEach(async () => {
    originalEnv = process.env.REFRESH_TOKEN_REVOKED_RETENTION_DAYS;
    delete process.env.REFRESH_TOKEN_REVOKED_RETENTION_DAYS;

    findMany = jest.fn();
    deleteMany = jest.fn();
    auditLog = jest.fn().mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CleanupRefreshTokensJob,
        {
          provide: PrismaService,
          useValue: { client: { refreshToken: { findMany, deleteMany } } },
        },
        { provide: AuditService, useValue: { log: auditLog } },
      ],
    }).compile();
    job = module.get(CleanupRefreshTokensJob);
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.REFRESH_TOKEN_REVOKED_RETENTION_DAYS;
    } else {
      process.env.REFRESH_TOKEN_REVOKED_RETENTION_DAYS = originalEnv;
    }
  });

  it('queries with both expired and revoked-cutoff predicates', async () => {
    findMany.mockResolvedValueOnce([{ id: 'a' }]);
    deleteMany.mockResolvedValueOnce({ count: 1 });

    await job.execute();

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { expiresAt: { lt: expect.any(Date) } },
            { revokedAt: { lt: expect.any(Date) } },
          ],
        },
      }),
    );
  });

  it('audits success with the default 90-day revoked retention', async () => {
    findMany.mockResolvedValueOnce([{ id: 'a' }]);
    deleteMany.mockResolvedValueOnce({ count: 1 });

    await job.execute();

    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'SYSTEM_CLEANUP_SUCCESS',
        target: 'RefreshTokens',
        details: expect.objectContaining({
          deletedCount: 1,
          revokedRetentionDays: 90,
        }),
      }),
    );
  });

  it('respects a custom REFRESH_TOKEN_REVOKED_RETENTION_DAYS value', async () => {
    process.env.REFRESH_TOKEN_REVOKED_RETENTION_DAYS = '30';
    findMany.mockResolvedValueOnce([{ id: 'a' }]);
    deleteMany.mockResolvedValueOnce({ count: 1 });

    await job.execute();

    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        details: expect.objectContaining({ revokedRetentionDays: 30 }),
      }),
    );
  });

  it('falls back to 90 when env var is invalid', async () => {
    process.env.REFRESH_TOKEN_REVOKED_RETENTION_DAYS = '-7';
    findMany.mockResolvedValueOnce([{ id: 'a' }]);
    deleteMany.mockResolvedValueOnce({ count: 1 });

    await job.execute();

    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        details: expect.objectContaining({ revokedRetentionDays: 90 }),
      }),
    );
  });

  it('does not throw and records a failure entry when Prisma fails', async () => {
    findMany.mockRejectedValueOnce(new Error('db down'));

    await expect(job.execute()).resolves.toBeUndefined();

    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'SYSTEM_CLEANUP_FAILURE',
        target: 'RefreshTokens',
        details: expect.objectContaining({ error: 'db down' }),
      }),
    );
  });
});
