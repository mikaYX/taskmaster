import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  MaxLength,
  MinLength,
} from 'class-validator';
import { TodoScope } from '@prisma/client';

export class CreateTodoDto {
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(255)
  title: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsEnum(TodoScope)
  scope?: TodoScope = TodoScope.PRIVATE;

  @IsOptional()
  @IsInt()
  groupId?: number;
}
