import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings';
import { JobLockService } from './job-lock.service';
import { JobRunner } from './job-runner.service';

@Module({
  imports: [SettingsModule],
  providers: [JobLockService, JobRunner],
  exports: [JobRunner],
})
export class JobRunnerModule {}
