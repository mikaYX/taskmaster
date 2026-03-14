import {
  Injectable,
  Logger,
  InternalServerErrorException,
  OnModuleInit,
  OnModuleDestroy,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { BackupLogicService } from './backup.logic';

@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name);

  constructor(
    @InjectQueue('backup') private readonly backupQueue: Queue,
    private readonly backupLogic: BackupLogicService,
  ) { }

  /**
   * Dispatch Backup Job (Async)
   */
  async createSystemSnapshot(
    type: 'DB' | 'FULL' = 'FULL',
  ): Promise<{ jobId: string; status: string }> {
    const job = await this.backupQueue.add('create', { type });
    return { jobId: job.id!, status: 'queued' };
  }

  /**
   * Dispatch Restore Job (Async)
   */
  async restoreSystemSnapshot(
    filename: string,
    options: { decryptionKey?: string; force?: boolean } = {},
  ): Promise<{ jobId: string; status: string }> {
    const job = await this.backupQueue.add('restore', { filename, options });
    return { jobId: job.id!, status: 'queued' };
  }

  /**
   * Dispatch Export Job (Async)
   */
  async exportData(
    format: 'json' | 'csv',
    encrypt: boolean = false,
  ): Promise<{ jobId: string; status: string }> {
    const job = await this.backupQueue.add('export', { format, encrypt });
    return { jobId: job.id!, status: 'queued' };
  }

  /**
   * Dispatch Import Job (Async)
   */
  async importBackup(
    tempPath: string,
    originalName: string,
  ): Promise<{ jobId: string; status: string }> {
    const job = await this.backupQueue.add('import', {
      tempPath,
      originalName,
    });
    return { jobId: job.id!, status: 'queued' };
  }

  /**
   * Get Job Status
   */
  async getJobStatus(jobId: string) {
    const job = await this.backupQueue.getJob(jobId);
    if (!job) {
      throw new NotFoundException(`Job ${jobId} not found`);
    }

    const state = await job.getState();
    const result = job.returnvalue;
    const error = job.failedReason;

    return {
      jobId: job.id,
      state,
      progress: job.progress,
      result,
      error,
      createdAt: job.timestamp,
      processedAt: job.processedOn,
      finishedAt: job.finishedOn,
    };
  }

  // Proxy other methods to logic service (Synchronous / Read-only)

  async listBackups() {
    return this.backupLogic.listBackups();
  }

  async cleanupExpired() {
    return this.backupLogic.cleanupExpired();
  }

  async getBackupPath(filename: string) {
    return await this.backupLogic.getBackupPath(filename);
  }

  async deleteBackup(filename: string) {
    return await this.backupLogic.deleteBackup(filename);
  }

  async validateBackup(filename: string) {
    return this.backupLogic.validateBackup(filename);
  }

  isEncryptionKeyPresent(): boolean {
    return this.backupLogic.isEncryptionKeyPresent();
  }

  isEncryptionKeyDefault(): boolean {
    return this.backupLogic.isEncryptionKeyDefault();
  }
}
