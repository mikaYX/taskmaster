import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { DelegationsService } from './delegations.service';
import { CreateDelegationDto } from './dto/create-delegation.dto';
import { UpdateDelegationDto } from './dto/update-delegation.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';

@Controller('tasks/:taskId/delegations')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN, UserRole.MANAGER)
export class DelegationsController {
  constructor(private readonly delegationsService: DelegationsService) {}

  @Post()
  create(
    @Param('taskId', ParseIntPipe) taskId: number,
    @Body() createDelegationDto: CreateDelegationDto,
    @CurrentUser('id') adminId: number,
  ) {
    return this.delegationsService.create(taskId, createDelegationDto, adminId);
  }

  @Get()
  findAll(@Param('taskId', ParseIntPipe) taskId: number) {
    return this.delegationsService.findAll(taskId);
  }

  @Patch(':id')
  update(
    @Param('taskId', ParseIntPipe) taskId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() updateDelegationDto: UpdateDelegationDto,
    @CurrentUser('id') adminId: number,
  ) {
    return this.delegationsService.update(
      taskId,
      id,
      updateDelegationDto,
      adminId,
    );
  }

  @Delete(':id')
  remove(
    @Param('taskId', ParseIntPipe) taskId: number,
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('id') adminId: number,
    @CurrentUser('username') adminUsername: string,
  ) {
    return this.delegationsService.remove(taskId, id, adminId, adminUsername);
  }
}
