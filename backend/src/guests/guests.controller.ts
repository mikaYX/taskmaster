import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Param,
  ParseIntPipe,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { GuestsService } from './guests.service';
import { JwtAuthGuard, RolesGuard, Roles, CurrentUser } from '../auth';
import { Permission } from '../auth/permissions.enum';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { Audit } from '../audit/decorators/audit.decorator';
import { AuditAction, AuditCategory } from '../audit/audit.constants';

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
