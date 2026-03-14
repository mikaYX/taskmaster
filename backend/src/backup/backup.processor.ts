import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { BackupLogicService } from './backup.logic';
import { ExportService } from './export.service';

@Processor('backup')
export class BackupProcessor extends WorkerHost {
  private readonly logger = new Logger(BackupProcessor.name);

  constructor(
    private readonly backupLogic: BackupLogicService,
    private readonly exportService: ExportService,
  ) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    this.logger.log(`Processing job ${job.id} (Name: ${job.name})`);

    switch (job.name) {
      case 'create':
        return this.handleCreate(job);
      case 'restore':
        return this.handleRestore(job);
      case 'export':
        return this.handleExport(job);
      case 'import':
        return this.handleImport(job);
      default:
        throw new Error(`Unknown job name: ${job.name}`);
    }
  }

  private async handleCreate(job: Job<{ type: 'DB' | 'FULL' }>) {
    this.logger.log(
      `Processing backup creation job ${job.id} (Type: ${job.data.type})`,
    );
    try {
      const result = await this.backupLogic.createSystemSnapshot(job.data.type);
      this.logger.log(`Backup job ${job.id} completed: ${result.filename}`);
      return result;
    } catch (error) {
      this.logger.error(`Backup job ${job.id} failed`, error);
      throw error;
    }
  }

  private async handleRestore(
    job: Job<{
      filename: string;
      options: { decryptionKey?: string; force?: boolean };
    }>,
  ) {
    this.logger.log(
      `Processing restore job ${job.id} (File: ${job.data.filename})`,
    );
    try {
      const result = await this.backupLogic.restoreSystemSnapshot(
        job.data.filename,
        job.data.options,
      );
      this.logger.log(`Restore job ${job.id} completed`);
      return result;
    } catch (error) {
      this.logger.error(`Restore job ${job.id} failed`, error);
      throw error;
    }
  }

  private async handleExport(
    job: Job<{ format: 'json' | 'csv'; encrypt?: boolean }>,
  ) {
    this.logger.log(
      `Processing export job ${job.id} (Format: ${job.data.format})`,
    );
    try {
      const path = await this.exportService.generateExport({
        format: job.data.format,
        encrypt: job.data.encrypt || false,
      });
      const filename = path.split(/[/\\]/).pop();
      this.logger.log(`Export job ${job.id} completed: ${filename}`);
      return { filename, path };
    } catch (error) {
      this.logger.error(`Export job ${job.id} failed`, error);
      throw error;
    }
  }

  private async handleImport(
    job: Job<{ tempPath: string; originalName: string }>,
  ) {
    this.logger.log(
      `Processing import job ${job.id} (File: ${job.data.originalName})`,
    );
    try {
      // Import logic (move file, validate)
      // Note: tempPath must be accessible by the worker.
      // In Docker/Volume, shared vol is assumed.
      const result = await this.backupLogic.importBackup(
        job.data.tempPath,
        job.data.originalName,
      );
      this.logger.log(`Import job ${job.id} completed`);
      return result;
    } catch (error) {
      this.logger.error(`Import job ${job.id} failed`, error);
      throw error;
    }
  }
}
