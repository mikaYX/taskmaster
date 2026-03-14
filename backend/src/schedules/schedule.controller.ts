import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Patch,
  Body,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { Permission } from '../auth/permissions.enum';
import { CompositeAuthGuard } from '../auth/guards/composite-auth.guard';
import { RolesGuard } from '../auth';
import { ScheduleService } from './schedule.service';
import {
  CreateScheduleDto,
  UpdateScheduleDto,
  BulkCreateScheduleDto,
} from './dto';

@Controller('schedules')
@UseGuards(CompositeAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'MANAGER')
export class ScheduleController {
  constructor(private readonly scheduleService: ScheduleService) {}

  @Get()
  @RequirePermission(Permission.SCHEDULE_READ)
  @Roles('SUPER_ADMIN', 'MANAGER', 'USER')
  findAll(
    @Query('taskId', new ParseIntPipe({ optional: true })) taskId?: number,
    @Query('status') status?: string,
    @Query('siteId') siteId?: string,
  ) {
    return this.scheduleService.findAll({ taskId, status, siteId });
  }

  @Get(':id')
  @RequirePermission(Permission.SCHEDULE_READ)
  @Roles('SUPER_ADMIN', 'MANAGER', 'USER')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.scheduleService.findOne(id);
  }

  @Post()
  @RequirePermission(Permission.SCHEDULE_CREATE)
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateScheduleDto) {
    return this.scheduleService.create(dto);
  }

  @Post('bulk')
  @RequirePermission(Permission.SCHEDULE_CREATE)
  @HttpCode(HttpStatus.CREATED)
  createBulk(@Body() dto: BulkCreateScheduleDto) {
    return this.scheduleService.createBulk(dto.items);
  }

  @Put(':id')
  @RequirePermission(Permission.SCHEDULE_UPDATE)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateScheduleDto,
  ) {
    return this.scheduleService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission(Permission.SCHEDULE_DELETE)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.scheduleService.remove(id);
  }

  @Patch(':id/pause')
  @RequirePermission(Permission.SCHEDULE_UPDATE)
  pause(@Param('id', ParseIntPipe) id: number) {
    return this.scheduleService.pause(id);
  }

  @Patch(':id/resume')
  @RequirePermission(Permission.SCHEDULE_UPDATE)
  resume(@Param('id', ParseIntPipe) id: number) {
    return this.scheduleService.resume(id);
  }
}
