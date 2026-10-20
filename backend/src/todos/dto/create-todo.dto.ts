import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { TodoPriority, TodoRecurrence, TodoScope } from '@prisma/client';
import { MAX_REMIND_BEFORE_MINUTES } from '../todo-reminder-time';

/** HH:mm, 24-hour. */
export const DUE_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export class CreateTodoDto {
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(255)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  /** Time of day of the due date (HH:mm, application timezone). */
  @IsOptional()
  @Matches(DUE_TIME_PATTERN)
  dueTime?: string;

  /** Minutes before the due moment to remind (0 = when it is due). */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_REMIND_BEFORE_MINUTES)
  remindBeforeMinutes?: number;

  @IsOptional()
  @IsEnum(TodoScope)
  scope?: TodoScope = TodoScope.PRIVATE;

  @IsOptional()
  @IsEnum(TodoPriority)
  priority?: TodoPriority;

  @IsOptional()
  @IsEnum(TodoRecurrence)
  recurrence?: TodoRecurrence;

  @IsOptional()
  @IsInt()
  groupId?: number;

  /** Who is in charge (collective todos only). */
  @IsOptional()
  @IsInt()
  assigneeId?: number;

  /** Makes this a subtask; scope and group are then taken from the parent. */
  @IsOptional()
  @IsInt()
  parentId?: number;
}
