import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { TodosService } from './todos.service';
import { CreateTodoDto } from './dto/create-todo.dto';
import { UpdateTodoDto } from './dto/update-todo.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { PrismaService } from '../prisma/prisma.service';
import { TodoScope } from '@prisma/client';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('todos')
export class TodosController {
  constructor(
    private readonly todosService: TodosService,
    private readonly prisma: PrismaService,
  ) {}

  private async getUserGroupIds(userId: number): Promise<number[]> {
    const memberships = await this.prisma.client.userGroupMembership.findMany({
      where: { userId },
      select: { groupId: true },
    });
    return memberships.map((m: { groupId: number }) => m.groupId);
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
    return this.todosService.create(createTodoDto, user.sub, siteId);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() updateTodoDto: UpdateTodoDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.todosService.update(+id, updateTodoDto, user.sub, user.role);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.todosService.remove(+id, user.sub, user.role);
  }
}
