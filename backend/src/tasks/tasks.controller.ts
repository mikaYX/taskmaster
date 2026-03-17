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
  ParseBoolPipe,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
  UploadedFile,
  Res,
  StreamableFile,
} from '@nestjs/common';
import * as fs from 'fs';
import { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { extname } from 'path';
import { ConfigService } from '@nestjs/config';
import { ProcedureStorageService } from './procedure-storage.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { Permission } from '../auth/permissions.enum';
import { Role } from '../enums/role.enum';
import { Audit } from '../audit/decorators/audit.decorator';
import { AuditAction, AuditCategory } from '../audit/audit.constants';
import { TasksService } from './tasks.service';

import {
  CreateTaskDto,
  UpdateTaskDto,
  ManageAssignmentsDto,
  CreateDelegationDto,
  OverrideOccurrenceDto,
  GetTasksQueryDto,
} from './dto';
import { JwtAuthGuard, RolesGuard, CurrentUser } from '../auth';
import { CompositeAuthGuard } from '../auth/guards/composite-auth.guard';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';
import { IdempotencyInterceptor } from '../common/interceptors/idempotency.interceptor';
import { UseInterceptors } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { FileValidationPipe } from '../common/pipes/file-validation.pipe';

/**
 * Tasks Controller.
 *
 * All endpoints require ADMIN role.
 * No status/instances/scheduler logic.
 */
@ApiTags('tasks')
@Controller('tasks')
@UseGuards(CompositeAuthGuard, RolesGuard)
// Default to ADMIN only, but override specific methods
@Roles('SUPER_ADMIN', 'MANAGER')
export class TasksController {
  constructor(
    private readonly tasksService: TasksService,

    private readonly procedureStorage: ProcedureStorageService,
    private readonly config: ConfigService,
  ) { }

  @Get()
  @RequirePermission(Permission.TASK_READ)
  @Roles('SUPER_ADMIN', 'MANAGER', 'USER')
  findAll(@Query() query: GetTasksQueryDto, @CurrentUser() user: JwtPayload) {
    return this.tasksService.findAll(query, user);
  }

  @Get('board')
  @Roles('SUPER_ADMIN', 'MANAGER', 'USER', 'GUEST')
  getBoard(
    @Query('start') start?: string,
    @Query('end') end?: string,
    @Query('filterUserId') filterUserId?: string,
    @Query('filterGroupId') filterGroupId?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortDesc') sortDesc?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('priority') priority?: string,
    @Query('project') project?: string,
    @Query('category') category?: string,
    @CurrentUser() user?: JwtPayload,
  ) {
    const startDate = start
      ? new Date(start)
      : new Date(new Date().setDate(new Date().getDate() - 7));
    const endDate = end
      ? new Date(end)
      : new Date(new Date().setDate(new Date().getDate() + 7));
    const isAdmin = user?.role === 'SUPER_ADMIN' || user?.role === 'MANAGER';
    const isGuest = user?.role === 'GUEST';
    const isSortDesc = sortDesc === 'true';

    // Forcer le filtre statut "en cours uniquement" pour les invités
    const safeStatus = isGuest ? 'RUNNING' : status;

    return this.tasksService.getBoardItems(
      startDate,
      endDate,
      user!.sub,
      user!.groupIds || [],
      isAdmin,
      isGuest ? undefined : (filterUserId ? parseInt(filterUserId, 10) : undefined),
      isGuest ? undefined : (filterGroupId ? parseInt(filterGroupId, 10) : undefined),
      {
        sortBy: isGuest ? undefined : sortBy,
        sortDesc: isSortDesc,
        page: isGuest ? undefined : (page ? parseInt(page, 10) : undefined),
        limit: isGuest ? undefined : (limit ? parseInt(limit, 10) : undefined),
        status: safeStatus,
        priority: isGuest ? undefined : priority,
        project: isGuest ? undefined : project,
        category: isGuest ? undefined : category,
      },
    );
  }

  @Get('count')
  @Roles('SUPER_ADMIN', 'MANAGER', 'USER')
  count() {
    return this.tasksService.count();
  }

  @Get('archived')
  @RequirePermission(Permission.TASK_READ)
  @Roles('SUPER_ADMIN', 'MANAGER', 'USER')
  getArchivedTasks() {
    return this.tasksService.getArchivedTasks();
  }


  @Get(':id')
  @Roles('SUPER_ADMIN', 'MANAGER', 'USER', 'GUEST')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.tasksService.findOne(id);
  }

  @Post(':id/status')
  @Audit({
    action: AuditAction.TASK_STATUS_UPDATED,
    category: AuditCategory.TASK,
  })
  @HttpCode(HttpStatus.OK)
  @Roles('SUPER_ADMIN', 'MANAGER', 'USER')
  setStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: import('./dto').SetStatusDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tasksService.setStatus(id, dto, user.sub, user.role);
  }

  @Post('preview')
  @HttpCode(HttpStatus.OK)
  preview(@Body() dto: CreateTaskDto) {
    return this.tasksService.preview(dto);
  }

  @Post()
  @Audit({
    action: AuditAction.TASK_CREATED,
    category: AuditCategory.TASK,
  })
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission(Permission.TASK_CREATE)
  @UseInterceptors(IdempotencyInterceptor)
  create(@Body() createTaskDto: CreateTaskDto) {
    return this.tasksService.create(createTaskDto);
  }

  @Put(':id')
  @RequirePermission(Permission.TASK_UPDATE)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateTaskDto: UpdateTaskDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tasksService.update(id, updateTaskDto, {
      id: user.sub,
      username: user.username,
    });
  }

  @Patch(':id/deactivate')
  deactivate(@Param('id', ParseIntPipe) id: number) {
    return this.tasksService.deactivate(id);
  }

  // === Procedures Uploads ===

  @Post(':id/procedure')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(Permission.TASK_UPDATE)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: Number(process.env.PROCEDURE_MAX_SIZE_MB || 5) * 1024 * 1024,
      },
    }),
  )
  async uploadProcedure(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile(
      new FileValidationPipe({
        allowedMimeTypes: [
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ],
      }),
    ) file: Express.Multer.File,
    @CurrentUser() user: JwtPayload,
  ) {
    if (!file) throw new BadRequestException('File is required');

    const task = await this.tasksService.findOne(id);
    const oldProcedureUrl = task.procedureUrl;

    const procedureUrl = await this.procedureStorage.storeProcedureFile(
      id,
      file.buffer,
      extname(file.originalname),
    );

    try {
      const updatedTask = await this.tasksService.update(
        id,
        { procedureUrl } as any,
        {
          id: user.sub,
          username: user.username,
        },
      );

      // Cleanup old file ONLY if the update succeeds AND it was a different local file
      if (
        oldProcedureUrl &&
        oldProcedureUrl.startsWith('local:') &&
        oldProcedureUrl !== procedureUrl
      ) {
        await this.procedureStorage.deleteSpecificFile(
          oldProcedureUrl.replace('local:', ''),
        );
      }

      return updatedTask;
    } catch (error) {
      // Rollback the newly created file if DB update fails
      await this.procedureStorage.deleteSpecificFile(
        procedureUrl.replace('local:', ''),
      );
      throw error;
    }
  }

  @Get(':id/procedure')
  @Roles('SUPER_ADMIN', 'MANAGER', 'USER', 'GUEST')
  @RequirePermission(Permission.TASK_READ)
  async downloadProcedure(
    @Param('id', ParseIntPipe) id: number,
    @Res({ passthrough: true }) res: Response,
  ) {
    const task = await this.tasksService.findOne(id);
    if (!task.procedureUrl?.startsWith('local:')) {
      throw new BadRequestException(
        'Task does not have a local procedure file',
      );
    }

    const filename = task.procedureUrl.replace('local:', '');
    const filePath = this.procedureStorage.getFilePathForStreaming(filename);

    const file = fs.createReadStream(filePath);

    let contentType = 'application/octet-stream';
    const lowerFilename = filename.toLowerCase();
    if (lowerFilename.endsWith('.pdf')) contentType = 'application/pdf';
    else if (lowerFilename.endsWith('.doc')) contentType = 'application/msword';
    else if (lowerFilename.endsWith('.docx')) {
      contentType =
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    }

    res.set({
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
    });

    return new StreamableFile(file);
  }

  @Delete(':id/procedure')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission(Permission.TASK_UPDATE)
  async deleteProcedure(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ) {
    const task = await this.tasksService.findOne(id);
    if (!task.procedureUrl?.startsWith('local:')) {
      return; // Nothing to delete
    }

    // Updating DB sets it to null for procedureUrl mapping (handled via update DTO partial)
    // Wait, setting procedureUrl to null or empty string. Since procedureUrl is string | null.
    // Instead of doing it manually, we can just update it:
    await this.tasksService.update(id, { procedureUrl: '' } as any, {
      id: user.sub,
      username: user.username,
    });
    // The TasksService update hook will automatically clean up the physical file
  }

  @Patch(':id/reactivate')
  reactivate(@Param('id', ParseIntPipe) id: number) {
    return this.tasksService.reactivate(id);
  }

  @Post(':id/run')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Execute a task manually (DRY_RUN mode in V1)' })
  @ApiResponse({
    status: 200,
    description: 'Task execution simulated (DRY_RUN)',
  })
  @UseInterceptors(IdempotencyInterceptor)
  run(@Param('id', ParseIntPipe) id: number) {
    return this.tasksService.run(id);
  }

  // === Occurrence Overrides ===

  @Post(':id/occurrences/override')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(Permission.TASK_UPDATE)
  async upsertOccurrenceOverride(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: OverrideOccurrenceDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tasksService.upsertOccurrenceOverride(id, dto, {
      id: user.sub,
      username: user.username,
    });
  }

  @Delete(':id/occurrences/override')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission(Permission.TASK_UPDATE)
  async deleteOccurrenceOverride(
    @Param('id', ParseIntPipe) id: number,
    @Query('originalDate') originalDate: string,
    @CurrentUser() user: JwtPayload,
  ) {
    if (!originalDate) {
      throw new BadRequestException('originalDate query parameter is required');
    }
    await this.tasksService.deleteOccurrenceOverride(id, originalDate, {
      id: user.sub,
      username: user.username,
    });
  }

  // === User Assignments ===

  @Post(':id/users')
  addUsers(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ManageAssignmentsDto,
  ) {
    return this.tasksService.addUserAssignments(id, dto.ids);
  }

  @Delete(':id')
  @Audit({
    action: AuditAction.TASK_DELETED,
    category: AuditCategory.TASK,
  })
  @Roles('SUPER_ADMIN', 'MANAGER', 'USER')
  @RequirePermission(Permission.TASK_DELETE)
  async deleteTask(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.tasksService.softDelete(id, user.sub);
    return { message: 'Task deleted successfully' };
  }

  @Post(':id/restore')
  @RequirePermission(Permission.TASK_DELETE)
  @Roles('SUPER_ADMIN', 'MANAGER', 'USER')
  async restoreTask(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ) {
    const task = await this.tasksService.restore(id, user.sub);
    return { message: 'Task restored successfully', task };
  }

  @Delete(':id/permanent')
  @RequirePermission(Permission.TASK_DELETE)
  @Roles('SUPER_ADMIN')
  async permanentDelete(@Param('id', ParseIntPipe) id: number) {
    await this.tasksService.hardDelete(id);
    return { message: 'Task permanently deleted' };
  }

  @Delete(':id/users')
  removeUsers(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ManageAssignmentsDto,
  ) {
    return this.tasksService.removeUserAssignments(id, dto.ids);
  }

  // === Group Assignments ===

  @Post(':id/groups')
  addGroups(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ManageAssignmentsDto,
  ) {
    return this.tasksService.addGroupAssignments(id, dto.ids);
  }

  @Delete(':id/groups')
  removeGroups(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ManageAssignmentsDto,
  ) {
    return this.tasksService.removeGroupAssignments(id, dto.ids);
  }
}
