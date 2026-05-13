import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard, Roles, RolesGuard } from '../auth';
import { VersionService, VersionStatusDto } from './version.service';

@Controller('system')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SystemController {
  constructor(private readonly versionService: VersionService) {}

  @Get('version')
  @Roles(UserRole.SUPER_ADMIN, UserRole.MANAGER)
  getVersion(): Promise<VersionStatusDto> {
    return this.versionService.getVersionStatus();
  }

  @Post('version/refresh')
  @Roles(UserRole.SUPER_ADMIN, UserRole.MANAGER)
  refreshVersion(): Promise<VersionStatusDto> {
    return this.versionService.refreshVersionStatus();
  }
}
