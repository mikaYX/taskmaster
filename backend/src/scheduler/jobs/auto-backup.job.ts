import { JobRunner } from '../job-runner.service';
import { JOB_DEFINITIONS } from '../job-definitions';
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import cronParser from 'cron-parser';
import type { SchedulerJob } from '../scheduler.interface';
import { BackupService } from '../../backup';
import { SettingsService } from '../../settings';

/**
 * Auto Backup Job.
 *
 * Runs a system backup based on configured schedule.
 * Since the schedule is dynamic (user configured), this job runs every minute
 * and checks if it matches the user's configuration.
 */
const DEF = JOB_DEFINITIONS['auto-backup'];

@Injectable()
export class AutoBackupJob implements SchedulerJob {
  readonly name = DEF.name;
  readonly cron = DEF.cron; // Run every minute to check schedule

  private readonly logger = new Logger(AutoBackupJob.name);

  constructor(
    private readonly backupService: BackupService,
    private readonly settings: SettingsService,
    private readonly runner: JobRunner,
  ) {
    this.runner.register(DEF, () => this.execute());
  }

  @Cron(DEF.cron, { name: DEF.name })
  handleCron() {
    return this.runner.run(DEF.name, 'cron');
  }

  async execute(): Promise<void> {
    // 1. Check if enabled
    const enabled = await this.settings.getRawValue('backup.enabled');
    if (!enabled) return;

    // 2. Get Schedule Config
    const scheduleType =
      (await this.settings.getRawValue('backup.scheduleType')) || 'daily'; // 'daily' | 'weekly' | 'custom'
    const customCron =
      (await this.settings.getRawValue('backup.cron')) || '0 3 * * *';
    const time = (await this.settings.getRawValue('backup.time')) || '00:00';
    const dayOfWeek =
      (await this.settings.getRawValue('backup.dayOfWeek')) ?? 1; // 0=Sunday, 1=Monday...

    // 3. Compare with Current Time
    const now = new Date();
    const currentDay = now.getDay(); // 0-6
    const currentHours = now.getHours().toString().padStart(2, '0');
    const currentMinutes = now.getMinutes().toString().padStart(2, '0');
    const currentTime = `${currentHours}:${currentMinutes}`;

    if (scheduleType === 'custom') {
      if (!this.shouldRunCustomCron(customCron, now)) return;
    } else {
      // Normalize time comparison (simple string equality is fine for HH:mm)
      if (time !== currentTime) return;

      // Check Day if weekly
      if (scheduleType === 'weekly' && dayOfWeek !== currentDay) return;
    }

    // 4. Run Backup
    this.logger.log(
      `[${this.name}] Schedule matched (Type: ${scheduleType}, Day: ${dayOfWeek}, Time: ${time}, Cron: ${customCron}). Starting backup...`,
    );
    const start = Date.now();

    try {
      const result = await this.backupService.createSystemSnapshot('FULL');
      const duration = Date.now() - start;
      this.logger.log(
        `[${this.name}] Job dispatched: Job ID ${result.jobId} (${duration}ms)`,
      );
    } catch (error) {
      const duration = Date.now() - start;
      this.logger.error(`[${this.name}] Job failed after ${duration}ms`, error);
      throw error;
    }
  }

  private shouldRunCustomCron(expression: string, now: Date): boolean {
    try {
      const interval = cronParser.parse(expression);
      const previous = interval.prev();
      const previousDate = previous.toDate();
      const diff = Math.abs(now.getTime() - previousDate.getTime());
      return diff < 60_000;
    } catch {
      this.logger.error(
        `[${this.name}] Invalid backup cron expression: ${expression}`,
      );
      return false;
    }
  }
}
