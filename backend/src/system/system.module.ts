import { Module } from '@nestjs/common';
import { SystemController } from './system.controller';
import { VersionService } from './version.service';

@Module({
  controllers: [SystemController],
  providers: [VersionService],
  exports: [VersionService],
})
export class SystemModule {}
