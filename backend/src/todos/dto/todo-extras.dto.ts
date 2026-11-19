import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
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

  /** The root comment this one answers; an answer to a reply is kept in the same thread. */
  @IsOptional()
  @IsInt()
  @Min(1)
  parentId?: number;

  /** People and teams picked in the @ list, as `user:<id>` / `group:<id>`. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @Matches(/^(user|group):[1-9]\d{0,9}$/, { each: true })
  mentions?: string[];
}

export class MarkCommentsReadDto {
  /** The highest comment id the person has actually been shown. */
  @IsInt()
  @Min(1)
  upToCommentId: number;
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
