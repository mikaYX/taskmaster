import {
  IsString,
  IsOptional,
  IsArray,
  IsEnum,
  IsDateString,
  MinLength,
  MaxLength,
  ArrayMaxSize,
} from 'class-validator';
import { Permission } from '../permissions.enum';

export class CreateApiKeyDto {
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsArray()
  @ArrayMaxSize(50)
  @IsEnum(Permission, { each: true })
  scopes!: string[];

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
