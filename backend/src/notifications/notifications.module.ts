import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { PushService } from './push.service';
import { PushController } from './push.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { SettingsModule } from '../settings/settings.module';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [PrismaModule, SettingsModule, EmailModule],
  providers: [NotificationsService, PushService],
  controllers: [NotificationsController, PushController],
  exports: [NotificationsService, PushService],
})
export class NotificationsModule {}
