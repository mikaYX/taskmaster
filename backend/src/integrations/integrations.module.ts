import { Module } from '@nestjs/common';
import { IntegrationsController } from './integrations.controller';
import { IntegrationsService } from './integrations.service';
import { TasksModule } from '../tasks/tasks.module';
import { StatusModule } from '../status/status.module';

@Module({
  imports: [TasksModule, StatusModule],
  controllers: [IntegrationsController],
  providers: [IntegrationsService],
  exports: [IntegrationsService],
})
export class IntegrationsModule {}
