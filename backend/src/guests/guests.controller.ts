import {
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
import { GuestsService } from './guests.service';

@Controller('guests')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'MANAGER')
export class GuestsController {
  constructor(private readonly guestsService: GuestsService) {}

  @Get()
  @RequirePermission(Permission.USER_READ)
  async list() {
    return this.guestsService.listGuests();
  }

  @Get('site/:siteId')
  @RequirePermission(Permission.USER_READ)
  async findBySite(@Param('siteId', ParseIntPipe) siteId: number) {
    return this.guestsService.findBySite(siteId);
  }

  @Post('site/:siteId')
  @RequirePermission(Permission.USER_WRITE)
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Param('siteId', ParseIntPipe) siteId: number,
    @CurrentUser() user: any,
  ) {
    return this.guestsService.createForSite(siteId, {
      id: user.sub,
      username: user.username,
    });
  }

  @Patch(':id/regenerate')
  @RequirePermission(Permission.USER_WRITE)
  async regenerate(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
  ) {
    return this.guestsService.regeneratePassword(id, {
      id: user.sub,
      username: user.username,
    });
  }

  @Delete(':id')
  @RequirePermission(Permission.USER_WRITE)
  @HttpCode(HttpStatus.OK)
  async revoke(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
  ) {
    return this.guestsService.revoke(id, {
      id: user.sub,
      username: user.username,
    });
  }
}
