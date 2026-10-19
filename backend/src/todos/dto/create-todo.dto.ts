import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { TodoPriority, TodoRecurrence, TodoScope } from '@prisma/client';

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

  /** Makes this a subtask; scope and group are then taken from the parent. */
  @IsOptional()
  @IsInt()
  parentId?: number;
}
