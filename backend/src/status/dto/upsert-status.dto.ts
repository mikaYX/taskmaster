import {
  IsInt,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
} from 'class-validator';
import { TaskStatus } from '@prisma/client';

/**
 * DTO for setting/updating a task status for a specific date.
 * Uses upsert logic - creates if not exists, updates if exists.
 */
export class UpsertStatusDto {
  @IsInt()
  taskId!: number;

  @IsDateString()
  instanceDate!: string;

  @IsEnum(TaskStatus, {
    message: 'Status must be SUCCESS, FAILED, MISSING, or RUNNING',
  })
  status!: TaskStatus;

  @IsOptional()
  @IsString()
  comment?: string;
}
