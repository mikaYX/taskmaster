import { Transform, Type } from 'class-transformer';
import {
  Allow,
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export class ChecklistStepDto {
  @IsString() @Matches(/^[a-zA-Z0-9_-]{1,64}$/) id: string;
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  label: string;
  @IsIn(['CHECK', 'TEXT', 'NUMBER', 'PHOTO']) kind:
    'CHECK' | 'TEXT' | 'NUMBER' | 'PHOTO';
  @IsBoolean() required: boolean;
}

export class ExecutionAnswerDto {
  @IsString() @Matches(/^[a-zA-Z0-9_-]{1,64}$/) id: string;
  // Validated against the configured step kind before persistence.
  @Allow() value: unknown;
}

export class CorrectiveActionDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(3)
  @MaxLength(255)
  title: string;
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dueDate?: string;
  @IsOptional() @IsInt() @Min(1) assigneeId?: number;
}

export class ExecutionSubmissionDto {
  @ValidateIf((_o, value) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(50)
  @ArrayUnique((answer: ExecutionAnswerDto) => answer?.id)
  @ValidateNested({ each: true })
  @Type(() => ExecutionAnswerDto)
  executionAnswers?: ExecutionAnswerDto[];

  @ValidateIf((_o, value) => value !== undefined)
  @ValidateNested()
  @Type(() => CorrectiveActionDto)
  correctiveAction?: CorrectiveActionDto;
}
