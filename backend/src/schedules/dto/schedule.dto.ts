import {
  IsString,
  IsOptional,
  IsInt,
  IsIn,
  IsDateString,
  Min,
  MaxLength,
  ValidateNested,
  ArrayMinSize,
  ArrayMaxSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { IsRRule, IsTimezone } from '../../tasks/dto/task.validators';

export class CreateScheduleDto {
  @IsInt()
  taskId!: number;

  @IsIn(['ON_SCHEDULE', 'FROM_COMPLETION'])
  recurrenceMode!: string;

  @IsOptional()
  @IsRRule()
  rrule?: string;

  @IsOptional()
  @IsTimezone()
  timezone?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  openOffset?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  closeOffset?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  dueOffset?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxOccurrences?: number;

  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @IsOptional()
  @IsInt()
  siteId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  label?: string;
}

export class UpdateScheduleDto {
  @IsOptional()
  @IsIn(['ON_SCHEDULE', 'FROM_COMPLETION'])
  recurrenceMode?: string;

  @IsOptional()
  @IsRRule()
  rrule?: string;

  @IsOptional()
  @IsTimezone()
  timezone?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  openOffset?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  closeOffset?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  dueOffset?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxOccurrences?: number;

  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @IsOptional()
  @IsInt()
  siteId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  label?: string;
}

export class ScheduleResponseDto {
  id!: number;
  taskId!: number;
  recurrenceMode!: string;
  rrule!: string | null;
  timezone!: string;
  openOffset!: number;
  closeOffset!: number | null;
  dueOffset!: number | null;
  status!: string;
  maxOccurrences!: number | null;
  occurrenceCount!: number;
  endsAt!: Date | null;
  pausedAt!: Date | null;
  siteId!: number | null;
  label!: string | null;
  createdAt!: Date;
  updatedAt!: Date;
}

export class BulkCreateScheduleDto {
  @ValidateNested({ each: true })
  @Type(() => CreateScheduleDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  items!: CreateScheduleDto[];
}

export class BulkCreateResponseDto {
  createdCount!: number;
  ids!: number[];
}

export function toScheduleResponse(schedule: any): ScheduleResponseDto {
  return {
    id: schedule.id,
    taskId: schedule.taskId,
    recurrenceMode: schedule.recurrenceMode,
    rrule: schedule.rrule,
    timezone: schedule.timezone,
    openOffset: schedule.openOffset,
    closeOffset: schedule.closeOffset,
    dueOffset: schedule.dueOffset,
    status: schedule.status,
    maxOccurrences: schedule.maxOccurrences,
    occurrenceCount: schedule.occurrenceCount,
    endsAt: schedule.endsAt,
    pausedAt: schedule.pausedAt,
    siteId: schedule.siteId,
    label: schedule.label,
    createdAt: schedule.createdAt,
    updatedAt: schedule.updatedAt,
  };
}
