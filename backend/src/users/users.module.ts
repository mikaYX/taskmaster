import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { UsersMeController } from './users-me.controller';
import { AuthModule } from '../auth';

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
  imports: [AuthModule],
  controllers: [UsersController, UsersMeController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
