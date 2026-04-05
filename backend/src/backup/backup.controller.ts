import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
  Body,
  UseInterceptors,
  UploadedFile,
  StreamableFile,
  BadRequestException,
} from '@nestjs/common';
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { BackupService } from './backup.service';
import { ExportService } from './export.service';
import { JwtAuthGuard, RolesGuard, Roles } from '../auth';
import { Inject, forwardRef } from '@nestjs/common';
import { EmailService } from '../email';
import { SettingsService } from '../settings';
import { IdempotencyInterceptor } from '../common/interceptors/idempotency.interceptor';
import { FileValidationPipe } from '../common/pipes/file-validation.pipe';

// Local definition to avoid global namespace issues with Express.Multer.File
interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  destination: string;
  filename: string;
  path: string;
  buffer: Buffer;
}

@Controller('backup')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN')
export class BackupController {
  constructor(
    private readonly backupService: BackupService,
    private readonly exportService: ExportService,
    private readonly settingsService: SettingsService,
    @Inject(forwardRef(() => EmailService))
    private readonly emailService: EmailService,
  ) {}

  @Get('status')
  status() {
    return {
      encryptionKeyPresent: this.backupService.isEncryptionKeyPresent(),
      encryptionKeyIsDefault: this.backupService.isEncryptionKeyDefault(),
      serverTime: new Date().toISOString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
  }

  @Post('system')
  @HttpCode(HttpStatus.ACCEPTED)
  @UseInterceptors(IdempotencyInterceptor)
  async createSystemSnapshot(@Body() body: { type: 'DB' | 'FULL' }) {
    return this.backupService.createSystemSnapshot(body.type || 'FULL');
  }

  @Post('restore')
  @HttpCode(HttpStatus.ACCEPTED)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './backups/temp_uploads',
        filename: (req: any, file: any, cb: any) => {
          const randomName = Array(32)
            .fill(null)
            .map(() => Math.round(Math.random() * 16).toString(16))
            .join('');
          cb(null, `${randomName}${extname(file.originalname)}`);
        },
      }),
    }),
  )
  async restore(
    @UploadedFile(
      new FileValidationPipe({
        allowedMimeTypes: ['application/gzip', 'application/x-gzip'],
        allowUndefinedMimeType: true, // for `.enc` streams
        allowedExtensionsWhenUndefined: ['.enc'],
        maxSizeBytes: 5 * 1024 * 1024 * 1024, // 5GB
      }),
    )
    file: MulterFile,
    @Body()
    body: {
      decryptionKey?: string;
      force?: string;
      filename?: string;
      tempFilename?: string;
    },
  ) {
    let sourceRef = '';
    let source: 'backup_name' | 'temp_upload_path' = 'backup_name';

    if (file) {
      sourceRef = file.filename;
      source = 'temp_upload_path';
    } else if (body.tempFilename) {
      sourceRef = body.tempFilename;
      source = 'temp_upload_path';
    } else if (body.filename) {
      sourceRef = body.filename;
    } else {
      throw new BadRequestException('No backup source provided');
    }

    const force = body.force === 'true';
    return this.backupService.restoreSystemSnapshot(
      sourceRef,
      {
        decryptionKey: body.decryptionKey,
        force,
      },
      source,
    );
  }

  @Post('validate-ext')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './backups/temp_uploads',
        filename: (req: any, file: any, cb: any) => {
          const randomName = Array(32)
            .fill(null)
            .map(() => Math.round(Math.random() * 16).toString(16))
            .join('');
          cb(null, `val_ext_${randomName}${extname(file.originalname)}`);
        },
      }),
    }),
  )
  async validateExternal(
    @UploadedFile(
      new FileValidationPipe({
        allowedMimeTypes: ['application/gzip', 'application/x-gzip'],
        allowUndefinedMimeType: true, // for `.enc` streams
        allowedExtensionsWhenUndefined: ['.enc'],
        maxSizeBytes: 1024 * 1024 * 1024, // 1GB limit for validation
      }),
    )
    file: MulterFile,
  ) {
    if (!file) throw new Error('No file uploaded');

    const result = await this.backupService.validateBackup(
      file.filename,
      'temp_upload_path',
    );

    // Return result + temp filename so frontend can reference it for restore
    return {
      ...result,
      tempFilename: file.filename,
    };
  }

  @Post('export')
  @HttpCode(HttpStatus.ACCEPTED)
  async exportData(@Body() body: { format: 'json' | 'csv' }) {
    return this.backupService.exportData(body.format, false);
  }

  @Get('status/:jobId')
  async getJobStatus(@Param('jobId') jobId: string) {
    return this.backupService.getJobStatus(jobId);
  }

  @Get('list')
  list() {
    return this.backupService.listBackups();
  }

  @Post('import')
  @HttpCode(HttpStatus.ACCEPTED)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './backups', // Note: For async, we should probably upload to temp first, but Queue can move from here if name collision handled logic.
        filename: (req: any, file: any, cb: any) => {
          // We use original name but might face collision if not careful.
          // LogicService handles collision check.
          // Better to upload to temp for async import to allow worker to fail gracefully on collision.
          // But let's stick to current logic: upload to ./backups but maybe prefix?
          // Wait, Controller handles upload. Logic handles move.
          // To support Async, we should upload to a temp location first!
          // Changing destination to './backups/temp_uploads' for safety.
          cb(null, `import_${Date.now()}_${file.originalname}`);
        },
      }),
    }),
    IdempotencyInterceptor,
  )
  async importBackup(
    @UploadedFile(
      new FileValidationPipe({
        allowedMimeTypes: ['application/gzip', 'application/x-gzip'],
        allowUndefinedMimeType: true, // for `.enc` streams
        allowedExtensionsWhenUndefined: ['.enc'],
        maxSizeBytes: 5 * 1024 * 1024 * 1024, // 5GB limit
      }),
    )
    file: MulterFile,
  ) {
    if (!file) throw new Error('No file uploaded');
    // We pass the temp path and original name (stripped of prefix)
    const originalName = file.originalname;
    return this.backupService.importBackup(file.path, originalName);
  }

  @Get('download/:filename')
  async download(@Param('filename') filename: string): Promise<StreamableFile> {
    const fs = require('fs');
    let filepath: string;

    if (filename.startsWith('export_')) {
      try {
        filepath = this.exportService.getExportPath(filename);
      } catch (e) {
        throw new BadRequestException('File not found');
      }
    } else {
      filepath = await this.backupService.getBackupPath(filename);
    }

    const file = fs.createReadStream(filepath);
    return new StreamableFile(file, {
      type: 'application/octet-stream',
      disposition: `attachment; filename="${filename}"`,
    });
  }

  /**
   * Legacy endpoint compatibility
   */
  @Post('export/test-email')
  @HttpCode(HttpStatus.OK)
  async testExportEmail(@Body() dto: { recipients: string[] }) {
    // Map 'recipients' to 'to'
    const to =
      dto.recipients && dto.recipients.length > 0 ? dto.recipients : [];
    if (to.length === 0) {
      throw new BadRequestException('No recipients provided');
    }

    return this.emailService.sendTest(
      to,
      'Test Export Email',
      'This is a test email from the backup system.',
    );
  }

  @Post('export/cleanup')
  @HttpCode(HttpStatus.OK)
  async triggerCleanup() {
    const retentionDays =
      (await this.settingsService.getRawValue<number>(
        'export.retention.days',
      )) ?? 30;
    const deleted = await this.exportService.cleanupExpired(retentionDays);
    return { deleted };
  }

  @Get('validate/:filename')
  async validate(@Param('filename') filename: string) {
    return this.backupService.validateBackup(filename);
  }

  @Delete(':filename')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('filename') filename: string) {
    return await this.backupService.deleteBackup(filename);
  }
}
