import { Module, forwardRef } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { SettingsController } from './settings.controller';
import { EncryptionService } from './encryption.service';
import { EmailModule } from '../email/email.module';
import { ApiKeysController } from './api-keys.controller';
import { AuthModule } from '../auth/auth.module';

/**
 * Settings Module.
 *
 * Provides:
 * - Application settings management
 * - Key whitelist with Zod validation
 * - AES-256-GCM encryption for sensitive values
 */
@Module({
  imports: [forwardRef(() => EmailModule), forwardRef(() => AuthModule)],
  controllers: [SettingsController, ApiKeysController],
  providers: [SettingsService, EncryptionService],
  exports: [SettingsService, EncryptionService],
})
export class SettingsModule {}
