import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser, JwtAuthGuard, Roles, RolesGuard } from '../auth';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { Permission } from '../auth/permissions.enum';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { CreateGuestsDto } from './dto/create-guests.dto';
import { GuestsService, type GuestActor } from './guests.service';

const actorOf = (user: JwtPayload): GuestActor => ({
  id: user.sub,
  username: user.username,
  role: user.role,
});

@Controller('guests')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'MANAGER')
export class GuestsController {
  constructor(private readonly guestsService: GuestsService) {}

  @Get()
  @RequirePermission(Permission.USER_READ)
  async list(@CurrentUser() user: JwtPayload) {
    return this.guestsService.listGuests(actorOf(user));
  }

  @Get('site/:siteId')
  @RequirePermission(Permission.USER_READ)
  async findBySite(
    @Param('siteId', ParseIntPipe) siteId: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.guestsService.findBySite(siteId, actorOf(user));
  }

  @Post('site/:siteId')
  @RequirePermission(Permission.USER_WRITE)
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Param('siteId', ParseIntPipe) siteId: number,
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateGuestsDto,
  ) {
    return this.guestsService.createForSite(siteId, actorOf(user), dto.views);
  }

  @Post(':id/link')
  @RequirePermission(Permission.USER_WRITE)
  @HttpCode(HttpStatus.CREATED)
  async createLink(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.guestsService.createLoginLink(id, actorOf(user));
  }

  @Patch(':id/regenerate')
  @RequirePermission(Permission.USER_WRITE)
  async regenerate(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.guestsService.regeneratePassword(id, actorOf(user));
  }

  @Delete(':id')
  @RequirePermission(Permission.USER_WRITE)
  @HttpCode(HttpStatus.OK)
  async revoke(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.guestsService.revoke(id, actorOf(user));
  }
}
