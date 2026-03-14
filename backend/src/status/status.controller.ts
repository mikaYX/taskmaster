import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { TaskStatus } from '@prisma/client';
import { StatusService } from './status.service';
import { UpsertStatusDto } from './dto';
import { JwtAuthGuard, RolesGuard, Roles, CurrentUser } from '../auth';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';

/**
 * Status Controller.
 *
 * All endpoints require ADMIN role.
 */
@Controller('status')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'MANAGER')
export class StatusController {
  constructor(private readonly statusService: StatusService) {}

  /**
   * Upsert status - idempotent create/update.
   */
  @Post()
  @HttpCode(HttpStatus.OK)
  upsert(@Body() dto: UpsertStatusDto, @CurrentUser() user: JwtPayload) {
    return this.statusService.upsert(dto, user.sub, user.username);
  }

  /**
   * Get statuses by date range.
   */
  @Get()
  @Roles('SUPER_ADMIN', 'MANAGER', 'USER', 'GUEST')
  findByDateRange(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('status') status?: TaskStatus,
  ) {
    return this.statusService.findByDateRange(startDate, endDate, status);
  }

  /**
   * Get status counts by date range.
   */
  @Get('counts')
  @Roles('SUPER_ADMIN', 'MANAGER', 'USER', 'GUEST')
  countByDateRange(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.statusService.countByDateRange(startDate, endDate);
  }

  /**
   * Get all statuses for a task.
   */
  @Get('task/:taskId')
  @Roles('SUPER_ADMIN', 'MANAGER', 'USER', 'GUEST')
  findByTask(@Param('taskId', ParseIntPipe) taskId: number) {
    return this.statusService.findByTask(taskId);
  }

  /**
   * Get specific status.
   */
  @Get('task/:taskId/date/:date')
  @Roles('SUPER_ADMIN', 'MANAGER', 'USER', 'GUEST')
  findOne(
    @Param('taskId', ParseIntPipe) taskId: number,
    @Param('date') date: string,
  ) {
    return this.statusService.findOne(taskId, date);
  }

  /**
   * Delete a status entry.
   */
  @Delete('task/:taskId/date/:date')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('taskId', ParseIntPipe) taskId: number,
    @Param('date') date: string,
  ) {
    return this.statusService.remove(taskId, date);
  }
}
