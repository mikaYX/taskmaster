import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  UseGuards,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import { ApiKeysService } from '../auth/api-keys.service';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { Roles } from '../auth/decorators';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { Permission } from '../auth/permissions.enum';
import { CreateApiKeyDto } from './dto/create-api-key.dto';

@Controller('settings/api-keys')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN')
export class ApiKeysController {
  constructor(private apiKeysService: ApiKeysService) {}

  @Post()
  @RequirePermission(Permission.SETTINGS_WRITE)
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateApiKeyDto) {
    return this.apiKeysService.createKey(dto.name, dto.description, dto.scopes);
  }

  @Get()
  @RequirePermission(Permission.SETTINGS_READ)
  async list() {
    return this.apiKeysService.list();
  }

  @Delete(':id')
  @RequirePermission(Permission.SETTINGS_WRITE)
  @HttpCode(HttpStatus.NO_CONTENT)
  async revoke(@Param('id', ParseIntPipe) id: number) {
    await this.apiKeysService.revoke(id);
  }

  @Post(':id/rotate')
  @RequirePermission(Permission.SETTINGS_WRITE)
  async rotate(@Param('id', ParseIntPipe) id: number) {
    return this.apiKeysService.rotate(id);
  }
}
