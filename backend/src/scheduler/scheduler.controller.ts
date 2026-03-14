import {
  Controller,
  Get,
  Post,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { SchedulerService } from './scheduler.service';
import { JwtAuthGuard, RolesGuard, Roles } from '../auth';

/**
 * Jobs Controller.
 *
 * ADMIN-only endpoints for monitoring and triggering system jobs.
 */
@Controller('jobs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN')
export class JobsController {
  constructor(private readonly schedulerService: SchedulerService) { }

  /**
   * Get status of all system jobs.
   */
  @Get()
  async getJobsStatus() {
    return await this.schedulerService.getJobsStatus();
  }

  /**
   * Manually trigger a system job.
   */
  @Post(':name/run')
  @HttpCode(HttpStatus.OK)
  triggerJob(@Param('name') name: string) {
    return this.schedulerService.triggerJob(name);
  }

  /**
   * Sync scheduler state with settings (Start/Stop all).
   */
  @Post('sync')
  @HttpCode(HttpStatus.OK)
  sync() {
    return this.schedulerService.syncSchedulerState();
  }

  /**
   * Enable/Disable a system job.
   */
  @Post(':name/toggle')
  @HttpCode(HttpStatus.OK)
  toggleJob(@Param('name') name: string) {
    return this.schedulerService.toggleJob(name);
  }
}
