import { Module } from '@nestjs/common';
import { GroupsService } from './groups.service';
import { GroupsController } from './groups.controller';

/**
 * Groups Module.
 *
 * Provides:
 * - Group CRUD operations
 * - User ↔ Group membership management
 *
 * Purely structural - no task-related logic.
 */
@Module({
  controllers: [GroupsController],
  providers: [GroupsService],
  exports: [GroupsService],
})
export class GroupsModule {}
