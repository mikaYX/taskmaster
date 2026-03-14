import { Module, forwardRef } from '@nestjs/common';
import { EmailService } from './email.service';
import { EmailController } from './email.controller';
import {
  SmtpProvider,
  MailgunProvider,
  MailjetProvider,
  SendGridProvider,
} from './providers';
import { SettingsModule } from '../settings';

/**
 * Email Module.
 *
 * Multi-provider email sending.
 * Test endpoint only - no automation.
 */
@Module({
  imports: [forwardRef(() => SettingsModule)],
  controllers: [EmailController],
  providers: [
    EmailService,
    SmtpProvider,
    MailgunProvider,
    MailjetProvider,
    SendGridProvider,
  ],
  exports: [EmailService],
})
export class EmailModule {}
