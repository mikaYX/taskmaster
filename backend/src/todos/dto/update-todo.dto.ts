import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { TodoPriority } from '@prisma/client';
import { MAX_REMIND_BEFORE_MINUTES } from '../todo-reminder-time';
import { DUE_TIME_PATTERN } from './create-todo.dto';

export class UpdateTodoDto {
  @IsOptional()
  @MinLength(1)
  @MaxLength(255)
  title?: string;

  /** null (or empty) clears the notes. */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsOptional()
  @IsDateString()
  dueDate?: string | null;

  /** null removes the time of day. */
  @IsOptional()
  @Matches(DUE_TIME_PATTERN)
  dueTime?: string | null;

  /** null goes back to the default lead time. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_REMIND_BEFORE_MINUTES)
  remindBeforeMinutes?: number | null;

  @IsOptional()
  @IsBoolean()
  isCompleted?: boolean;

  @IsOptional()
  @IsEnum(TodoPriority)
  priority?: TodoPriority;

  /** null detaches the todo from its group (whole site). */
  @IsOptional()
  @IsInt()
  groupId?: number | null;

  /** Who is in charge; null removes the assignment. */
  @IsOptional()
  @IsInt()
  assigneeId?: number | null;
}
