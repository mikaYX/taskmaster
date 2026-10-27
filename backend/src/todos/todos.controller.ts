import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Patch,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Delete,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  StreamableFile,
  Header,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { TodosService, TodoActor } from './todos.service';
import { CreateTodoDto } from './dto/create-todo.dto';
import { UpdateTodoDto } from './dto/update-todo.dto';
import {
  CreateTodoCommentDto,
  ReorderTodosDto,
  UpdateTodoPreferencesDto,
} from './dto/todo-extras.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { PrismaService } from '../prisma/prisma.service';
import { PushService } from '../notifications/push.service';
import { TodoScope } from '@prisma/client';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('todos')
export class TodosController {
  constructor(
    private readonly todosService: TodosService,
    private readonly prisma: PrismaService,
    private readonly push: PushService,
  ) {}

  private async getUserGroupIds(userId: number): Promise<number[]> {
    const memberships = await this.prisma.client.userGroupMembership.findMany({
      where: { userId },
      select: { groupId: true },
    });
    return memberships.map((m: { groupId: number }) => m.groupId);
  }

  private async actor(user: JwtPayload): Promise<TodoActor> {
    return {
      userId: user.sub,
      role: user.role,
      siteId: this.prisma.getDefaultSiteId() ?? 0,
      groupIds: await this.getUserGroupIds(user.sub),
    };
  }

  private parseScope(scope?: string): 'PRIVATE' | 'COLLECTIVE' | undefined {
    if (scope === undefined || scope === '') return undefined;
    if (scope !== TodoScope.PRIVATE && scope !== TodoScope.COLLECTIVE) {
      throw new BadRequestException('scope must be PRIVATE or COLLECTIVE');
    }
    return scope;
  }

  @Get()
  async findAll(
    @CurrentUser() user: JwtPayload,
    @Query('scope') scope?: 'PRIVATE' | 'COLLECTIVE',
  ) {
    let userGroupIds: number[] = [];
    if (scope === 'COLLECTIVE' || !scope) {
      userGroupIds = await this.getUserGroupIds(user.sub);
    }
    const siteId = this.prisma.getDefaultSiteId() ?? 0;
    return this.todosService.findAll(user.sub, userGroupIds, siteId, scope);
  }

  /** The teams the current user leads, with their members (empty for anyone else). */
  @Get('dispatch-targets')
  dispatchTargets(@CurrentUser() user: JwtPayload) {
    return this.todosService.dispatchTargets(user.sub);
  }

  /** What needs attention now (badges and the opening reminder). */
  @Get('summary')
  async summary(@CurrentUser() user: JwtPayload) {
    const actor = await this.actor(user);
    return this.todosService.summary(
      actor.userId,
      actor.groupIds,
      actor.siteId,
    );
  }

  /** Ticked todos beyond the 24-hour list, searchable and paged. */
  @Get('history')
  async history(
    @CurrentUser() user: JwtPayload,
    @Query('scope') scope?: string,
    @Query('search') search?: string,
    @Query('cursor') cursor?: string,
    @Query('take') take?: string,
  ) {
    const actor = await this.actor(user);
    return this.todosService.history(
      actor.userId,
      actor.groupIds,
      actor.siteId,
      this.parseScope(scope),
      {
        search,
        cursor: cursor ? Number(cursor) || undefined : undefined,
        take: take ? Number(take) || undefined : undefined,
      },
    );
  }

  @Get('preferences')
  async preferences(@CurrentUser() user: JwtPayload) {
    return {
      ...(await this.todosService.getPreferences(user.sub)),
      pushAvailable: this.push.isEnabled(),
      pushDevices: await this.push.countForUser(user.sub),
    };
  }

  @Put('preferences')
  async updatePreferences(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateTodoPreferencesDto,
  ) {
    return {
      ...(await this.todosService.updatePreferences(user.sub, dto)),
      pushAvailable: this.push.isEnabled(),
      pushDevices: await this.push.countForUser(user.sub),
    };
  }

  @Post()
  async create(
    @Body() createTodoDto: CreateTodoDto,
    @CurrentUser() user: JwtPayload,
  ) {
    if (createTodoDto.scope === TodoScope.COLLECTIVE) {
      if (
        user.role !== 'MANAGER' &&
        user.role !== 'ADMIN' &&
        user.role !== 'SUPER_ADMIN'
      ) {
        throw new ForbiddenException(
          'Only managers and administrators can create collective todos',
        );
      }
    }
    const siteId = this.prisma.getDefaultSiteId() ?? 0;
    return this.todosService.create(createTodoDto, user.sub, siteId, user.role);
  }

  /** Must stay above `:id` so "completed" is not read as an id. */
  @Delete('completed')
  async clearCompleted(
    @Query('scope') scope: string,
    @CurrentUser() user: JwtPayload,
  ) {
    if (scope !== TodoScope.PRIVATE && scope !== TodoScope.COLLECTIVE) {
      throw new BadRequestException('scope must be PRIVATE or COLLECTIVE');
    }
    const userGroupIds = await this.getUserGroupIds(user.sub);
    const siteId = this.prisma.getDefaultSiteId() ?? 0;
    return this.todosService.clearCompleted(
      scope,
      user.sub,
      user.role,
      siteId,
      userGroupIds,
    );
  }

  /** Must stay above `:id`. */
  @Patch('reorder')
  reorder(@Body() dto: ReorderTodosDto, @CurrentUser() user: JwtPayload) {
    const siteId = this.prisma.getDefaultSiteId() ?? 0;
    return this.todosService.reorder(dto.ids, user.sub, user.role, siteId);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() updateTodoDto: UpdateTodoDto,
    @CurrentUser() user: JwtPayload,
  ) {
    const siteId = this.prisma.getDefaultSiteId() ?? 0;
    return this.todosService.update(
      +id,
      updateTodoDto,
      user.sub,
      user.role,
      siteId,
    );
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    const siteId = this.prisma.getDefaultSiteId() ?? 0;
    return this.todosService.remove(+id, user.sub, user.role, siteId);
  }

  // ---- Comments ----

  @Get(':id/comments')
  async comments(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.todosService.listComments(id, await this.actor(user));
  }

  @Post(':id/comments')
  async addComment(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateTodoCommentDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.todosService.addComment(id, dto.body, await this.actor(user));
  }

  @Delete(':id/comments/:commentId')
  async deleteComment(
    @Param('id', ParseIntPipe) id: number,
    @Param('commentId', ParseIntPipe) commentId: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.todosService.deleteComment(
      id,
      commentId,
      await this.actor(user),
    );
  }

  // ---- Attachments ----

  @Get(':id/attachments')
  async attachments(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.todosService.listAttachments(id, await this.actor(user));
  }

  @Post(':id/attachments')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    }),
  )
  async addAttachment(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: { buffer: Buffer; originalname?: string } | undefined,
    @CurrentUser() user: JwtPayload,
  ) {
    if (!file) throw new BadRequestException('No file uploaded');
    return this.todosService.addAttachment(id, file, await this.actor(user));
  }

  @Get(':id/attachments/:attachmentId')
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  async downloadAttachment(
    @Param('id', ParseIntPipe) id: number,
    @Param('attachmentId', new ParseUUIDPipe({ version: '4' }))
    attachmentId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    const file = await this.todosService.downloadAttachment(
      id,
      attachmentId,
      await this.actor(user),
    );
    // The name was cleaned when stored; encoding keeps any accent safe in the header.
    return new StreamableFile(file.stream, {
      type: file.mimeType,
      length: file.size,
      disposition: `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
    });
  }

  @Delete(':id/attachments/:attachmentId')
  async deleteAttachment(
    @Param('id', ParseIntPipe) id: number,
    @Param('attachmentId', new ParseUUIDPipe({ version: '4' }))
    attachmentId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.todosService.deleteAttachment(
      id,
      attachmentId,
      await this.actor(user),
    );
  }
}
