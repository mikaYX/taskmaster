import {
  IsArray,
  ArrayNotEmpty,
  IsEnum,
  IsString,
  IsOptional,
} from 'class-validator';
import { Permission } from '../../auth/permissions.enum';

export class CreateApiKeyDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(Permission, {
    each: true,
    message: 'Each scope must be a valid Permission enum value',
  })
  scopes: Permission[];

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;
}
