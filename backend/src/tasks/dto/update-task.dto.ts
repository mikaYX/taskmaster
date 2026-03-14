import {
  IsString,
  IsOptional,
  IsBoolean,
  IsDateString,
  IsInt,
  MaxLength,
  MinLength,
  IsIn,
  Min,
  ValidateIf,
} from 'class-validator';
import { IsRRule, IsTimezone, IsHHmm } from './task.validators';
import { IsValidRecurrenceDate } from '../validators';

/**
 * DTO for updating an existing task.
 */
export class UpdateTaskDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  periodicity?: string;

  @IsOptional()
  @IsString()
  @MinLength(5)
  description?: string;

  @IsOptional()
  @IsString()
  @IsIn(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])
  priority?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  project?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  category?: string;

  @IsOptional()
  @IsString()
  procedureUrl?: string;

  @IsOptional()
  @IsDateString()
  @IsValidRecurrenceDate({
    message: 'Invalid start date for this recurrence type',
  })
  startDate?: string;

  @IsOptional()
  @IsDateString()
  @IsValidRecurrenceDate({
    message: 'Invalid due date for this recurrence type',
  })
  endDate?: string;

  @IsOptional()
  @IsBoolean()
  skipWeekends?: boolean;

  @IsOptional()
  @IsBoolean()
  skipHolidays?: boolean;

  // P6.1
  @IsOptional()
  @IsIn(['ON_SCHEDULE', 'FROM_COMPLETION'])
  recurrenceMode?: string;

  @ValidateIf(
    (o: any) => o.periodicity !== 'once' && o.periodicity !== undefined,
  )
  @IsString()
  @IsRRule()
  rrule?: string;

  @IsOptional()
  @IsTimezone()
  timezone?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  dueOffset?: number;

  // Scheduling Windows V2
  @IsOptional()
  @IsBoolean()
  useGlobalWindowDefaults?: boolean;

  @IsOptional()
  @IsHHmm()
  windowStartTime?: string;

  @IsOptional()
  @IsHHmm()
  windowEndTime?: string;

  /**
   * If true, the scheduling engine will treat the selected days as a single continuous block
   * rather than separate daily occurrences. When evaluating overlap or next instances,
   * the cron/job will only trigger on the first day of the block, letting the active period
   * span until the end day without firing multiple distinct instances.
   */
  @IsOptional()
  @IsBoolean()
  isContinuousBlock?: boolean;
}
