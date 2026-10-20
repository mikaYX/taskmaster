import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class ReorderTodosDto {
  /** Todo ids in the wanted order (one priority group, top to bottom). */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsInt({ each: true })
  ids: number[];
}

export class CreateTodoCommentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  body: string;
}

export class UpdateTodoPreferencesDto {
  @IsOptional()
  @IsBoolean()
  email?: boolean;

  @IsOptional()
  @IsBoolean()
  push?: boolean;

  @IsOptional()
  @IsBoolean()
  collective?: boolean;
}
