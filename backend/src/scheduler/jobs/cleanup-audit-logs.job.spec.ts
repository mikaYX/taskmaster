import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma';
import { AuditService } from '../../audit/audit.service';
import { CleanupAuditLogsJob } from './cleanup-audit-logs.job';

/**
 * Tests for AUDIT.md Finding #9 — audit log retention.
 *
 * The job MUST:
 *  - delete only rows older than the retention cutoff
 *  - batch its DELETEs (BATCH_SIZE) to avoid long locks
 *  - log a SYSTEM_CLEANUP_SUCCESS audit entry only when something was deleted
 *  - tolerate Prisma failures (logs SYSTEM_CLEANUP_FAILURE, never throws)
 *  - become a no-op when AUDIT_LOG_RETENTION_DAYS<=0
 */
describe('CleanupAuditLogsJob', () => {
  let job: CleanupAuditLogsJob;
  let findMany: jest.Mock;
  let deleteMany: jest.Mock;
  let auditLog: jest.Mock;
  let originalEnv: string | undefined;

  beforeEach(async () => {
    originalEnv = process.env.AUDIT_LOG_RETENTION_DAYS;
    delete process.env.AUDIT_LOG_RETENTION_DAYS;

    findMany = jest.fn();
    deleteMany = jest.fn();
    auditLog = jest.fn().mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CleanupAuditLogsJob,
        {
          provide: PrismaService,
          useValue: { client: { auditLog: { findMany, deleteMany } } },
        },
        { provide: AuditService, useValue: { log: auditLog } },
      ],
    }).compile();
    job = module.get(CleanupAuditLogsJob);
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.AUDIT_LOG_RETENTION_DAYS;
    } else {
      process.env.AUDIT_LOG_RETENTION_DAYS = originalEnv;
    }
  });

  it('is a no-op when AUDIT_LOG_RETENTION_DAYS <= 0', async () => {
    process.env.AUDIT_LOG_RETENTION_DAYS = '0';

    await job.execute();

    expect(findMany).not.toHaveBeenCalled();
    expect(deleteMany).not.toHaveBeenCalled();
    expect(auditLog).not.toHaveBeenCalled();
  });

  it('deletes a single batch and stops when fewer rows than BATCH_SIZE are returned', async () => {
    findMany.mockResolvedValueOnce([{ id: 1 }, { id: 2 }, { id: 3 }]);
    deleteMany.mockResolvedValueOnce({ count: 3 });

    await job.execute();

    expect(findMany).toHaveBeenCalledTimes(1);
    expect(deleteMany).toHaveBeenCalledTimes(1);
    expect(deleteMany).toHaveBeenCalledWith({
      where: { id: { in: [1, 2, 3] } },
    });
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'SYSTEM_CLEANUP_SUCCESS',
        target: 'AuditLogs',
        details: expect.objectContaining({ deletedCount: 3, batches: 1 }),
      }),
    );
  });

  it('iterates multiple batches until a non-full batch is returned', async () => {
    const fullBatch = Array.from({ length: 10_000 }, (_, i) => ({ id: i }));
    findMany
      .mockResolvedValueOnce(fullBatch)
      .mockResolvedValueOnce(fullBatch)
      .mockResolvedValueOnce([{ id: 1 }, { id: 2 }]);
    deleteMany
      .mockResolvedValueOnce({ count: 10_000 })
      .mockResolvedValueOnce({ count: 10_000 })
      .mockResolvedValueOnce({ count: 2 });

    await job.execute();

    expect(findMany).toHaveBeenCalledTimes(3);
    expect(deleteMany).toHaveBeenCalledTimes(3);
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        details: expect.objectContaining({
          deletedCount: 20_002,
          batches: 3,
        }),
      }),
    );
  });

  it('skips the audit summary when zero rows were deleted', async () => {
    findMany.mockResolvedValueOnce([]);

    await job.execute();

    expect(deleteMany).not.toHaveBeenCalled();
    expect(auditLog).not.toHaveBeenCalled();
  });

  it('records a SYSTEM_CLEANUP_FAILURE audit entry but does not throw on Prisma errors', async () => {
    findMany.mockRejectedValueOnce(new Error('connection refused'));

    await expect(job.execute()).resolves.toBeUndefined();

    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'SYSTEM_CLEANUP_FAILURE',
        target: 'AuditLogs',
        details: expect.objectContaining({ error: 'connection refused' }),
      }),
    );
  });

  it('uses default 365 days when env var is unset', async () => {
    findMany.mockResolvedValueOnce([{ id: 1 }]);
    deleteMany.mockResolvedValueOnce({ count: 1 });

    await job.execute();

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { timestamp: { lt: expect.any(Date) } },
        take: 10_000,
      }),
    );

    // Audit summary should reflect retentionDays=365
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        details: expect.objectContaining({ retentionDays: 365 }),
      }),
    );
  });

  it('falls back to default when env var is non-numeric', async () => {
    process.env.AUDIT_LOG_RETENTION_DAYS = 'banana';
    findMany.mockResolvedValueOnce([{ id: 1 }]);
    deleteMany.mockResolvedValueOnce({ count: 1 });

    await job.execute();

    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        details: expect.objectContaining({ retentionDays: 365 }),
      }),
    );
  });
});
