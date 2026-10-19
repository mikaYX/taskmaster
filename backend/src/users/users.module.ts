import { SettingsModule } from '../settings/settings.module';
import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { UsersMeController } from './users-me.controller';
import { AuthModule } from '../auth';
import { EmailModule } from '../email/email.module';
import { UserWelcomeEmailService } from './user-welcome-email.service';

/**
 * Users Module.
 *
 * Provides:
 * - User CRUD operations
 * - Soft delete with restore capability
 * - Password reset by admin
 * - Current user (me) routes: avatar upload
 *
 * Dependencies:
 * - AuthModule for password hashing
 */
@Module({
  imports: [AuthModule, SettingsModule, EmailModule],
  controllers: [UsersController, UsersMeController],
  providers: [UsersService, UserWelcomeEmailService],
  exports: [UsersService],
})
export class UsersModule {}
