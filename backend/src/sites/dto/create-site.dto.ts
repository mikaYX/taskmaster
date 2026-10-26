import {
  IsString,
  IsOptional,
  IsInt,
  IsIn,
  ValidateIf,
  MinLength,
  MaxLength,
  Matches,
} from 'class-validator';
import { SUPPORTED_COUNTRIES } from '../site-country';
import { IsTimezone } from '../../tasks/dto/task.validators';

export class CreateSiteDto {
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name: string;

  @IsString()
  @Matches(/^[A-Z0-9_-]+$/, {
    message: 'Code must be uppercase alphanumeric with hyphens/underscores',
  })
  @MinLength(2)
  @MaxLength(50)
  code: string;

  @IsOptional()
  @IsString()
  description?: string;

  /** Holiday country for this site; null/omitted = global `app.country`. */
  @IsOptional()
  @IsIn(SUPPORTED_COUNTRIES)
  country?: string | null;

  /** Default timezone for tasks created on this site; null/omitted = global default. */
  @ValidateIf((_, v) => v != null)
  @IsTimezone()
  timezone?: string | null;

  @IsOptional()
  @IsInt()
  parentId?: number;
}
