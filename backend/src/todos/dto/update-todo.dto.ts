import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateTodoDto {
  @IsOptional()
  @MinLength(1)
  @MaxLength(255)
  title?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string | null;

  @IsOptional()
  @IsBoolean()
  isCompleted?: boolean;

  @IsOptional()
  @IsInt()
  groupId?: number;
}
