import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { BackupService } from './backup.service';
import { BackupLogicService } from './backup.logic';
import { BackupController } from './backup.controller';
import { BackupProcessor } from './backup.processor';
import { SettingsModule } from '../settings';
import { EmailModule } from '../email/email.module';
import { EncryptionService } from './encryption.service';
import { ExportService } from './export.service';
import { ConfigModule } from '@nestjs/config';

/**
 * Backup Module.
 *
 * Manual backup of PostgreSQL + exports.
 * Uses BullMQ for async processing (create/restore).
 */
@Module({
  imports: [
    SettingsModule,
    EmailModule,
    ConfigModule,
    BullModule.registerQueue({
      name: 'backup',
    }),
  ],
  controllers: [BackupController],
  providers: [
    BackupService,
    BackupLogicService,
    BackupProcessor,
    EncryptionService,
    ExportService,
  ],
  exports: [BackupService, ExportService],
})
export class BackupModule {}
