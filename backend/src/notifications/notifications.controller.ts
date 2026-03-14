import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Put,
  UseGuards,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import {
  CreateNotificationChannelDto,
  UpdateNotificationChannelDto,
} from './dto/channel.dto';
import { SaveTaskNotificationsDto } from './dto/task-notification.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  // ==========================================
  // Channels Management
  // ==========================================

  @Get('notifications/channels')
  @Roles(UserRole.SUPER_ADMIN, UserRole.MANAGER)
  getChannels(@Query('enabled') enabled?: string) {
    return this.notificationsService.getChannels(
      enabled === 'true' ? true : undefined,
    );
  }

  @Post('notifications/channels')
  @Roles(UserRole.SUPER_ADMIN)
  createChannel(@Body() dto: CreateNotificationChannelDto) {
    return this.notificationsService.createChannel(dto);
  }

  @Patch('notifications/channels/:id')
  @Roles(UserRole.SUPER_ADMIN)
  updateChannel(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateNotificationChannelDto,
  ) {
    return this.notificationsService.updateChannel(id, dto);
  }

  @Delete('notifications/channels/:id')
  @Roles(UserRole.SUPER_ADMIN)
  deleteChannel(@Param('id', ParseIntPipe) id: number) {
    return this.notificationsService.deleteChannel(id);
  }

  @Post('notifications/channels/:id/test')
  @Roles(UserRole.SUPER_ADMIN)
  testChannel(
    @Param('id', ParseIntPipe) id: number,
    @Body('email') email?: string,
  ) {
    return this.notificationsService.testChannel(id, email);
  }

  // ==========================================
  // Task Notifications
  // ==========================================

  @Get('tasks/:taskId/notifications')
  @Roles(UserRole.SUPER_ADMIN, UserRole.MANAGER)
  getTaskNotifications(@Param('taskId', ParseIntPipe) taskId: number) {
    return this.notificationsService.getTaskNotifications(taskId);
  }

  @Put('tasks/:taskId/notifications')
  @Roles(UserRole.SUPER_ADMIN, UserRole.MANAGER)
  saveTaskNotifications(
    @Param('taskId', ParseIntPipe) taskId: number,
    @Body() dto: SaveTaskNotificationsDto,
  ) {
    return this.notificationsService.saveTaskNotifications(taskId, dto);
  }
}
