import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { CurrentUser, Roles, RolesGuard } from '../auth';
import { CompositeAuthGuard } from '../auth/guards/composite-auth.guard';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';
import { FileValidationPipe } from '../common/pipes/file-validation.pipe';
import { Audit } from '../audit/decorators/audit.decorator';
import { AuditCategory } from '../audit/audit.constants';
import { ListCorrectiveActionsDto } from './dto/list-corrective-actions.dto';
import { TaskExecutionService } from './task-execution.service';

class UpdateCorrectiveActionDto {
  @IsIn(['OPEN', 'CLOSED']) state: 'OPEN' | 'CLOSED';
  @IsOptional() @IsString() @MaxLength(2000) resolution?: string;
}

@Controller()
@UseGuards(CompositeAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'MANAGER', 'USER')
export class TaskExecutionController {
  constructor(private readonly execution: TaskExecutionService) {}

  @Post('tasks/:taskId/execution/evidence')
  @Audit({ action: 'TASK_EVIDENCE_UPLOADED', category: AuditCategory.TASK })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    }),
  )
  upload(
    @Param('taskId', ParseIntPipe) taskId: number,
    @Query('date') date: string,
    @UploadedFile(
      new FileValidationPipe({
        allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
        maxSizeBytes: 5 * 1024 * 1024,
      }),
    )
    file: { buffer: Buffer },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.execution.upload(taskId, date, file.buffer, user);
  }

  @Get('tasks/:taskId/execution/evidence/:id')
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  async download(
    @Param('taskId', ParseIntPipe) taskId: number,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    const result = await this.execution.download(taskId, id, user);
    return new StreamableFile(result.stream, {
      type: result.mimeType,
      length: result.size,
      disposition: 'attachment; filename="evidence"',
    });
  }

  @Get('tasks/:taskId/execution/assignees')
  assignees(
    @Param('taskId', ParseIntPipe) taskId: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.execution.assignees(taskId, user);
  }

  @Get('corrective-actions/search')
  search(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListCorrectiveActionsDto,
  ) {
    return this.execution.searchActions(user, query);
  }

  @Get('corrective-actions')
  list(@CurrentUser() user: JwtPayload) {
    return this.execution.listActions(user);
  }

  @Patch('corrective-actions/:id')
  @Audit({ action: 'CORRECTIVE_ACTION_UPDATED', category: AuditCategory.TASK })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCorrectiveActionDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.execution.updateAction(id, dto.state, dto.resolution, user);
  }
}
