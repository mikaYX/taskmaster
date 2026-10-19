import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { TodoPriority, TodoRecurrence } from '@prisma/client';

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

  @IsOptional()
  @IsBoolean()
  isCompleted?: boolean;

  @IsOptional()
  @IsEnum(TodoPriority)
  priority?: TodoPriority;

  @IsOptional()
  @IsEnum(TodoRecurrence)
  recurrence?: TodoRecurrence;

  /** null detaches the todo from its group (whole site). */
  @IsOptional()
  @IsInt()
  groupId?: number | null;
}
