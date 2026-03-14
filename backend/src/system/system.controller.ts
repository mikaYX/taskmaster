import { Controller, Get } from '@nestjs/common';
import { VersionService, VersionStatusDto } from './version.service';

@Controller('system')
export class SystemController {
  constructor(private readonly versionService: VersionService) {}

  @Get('version')
  getVersion(): Promise<VersionStatusDto> {
    return this.versionService.getVersionStatus();
  }
}
