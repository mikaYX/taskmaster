import {
  IsString,
  IsOptional,
  IsEmail,
  IsEnum,
  MinLength,
  MaxLength,
} from 'class-validator';
import { UserRole } from '@prisma/client';

/**
 * DTO for updating an existing user.
 * All fields are optional.
 */
export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  fullname?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Invalid email format' })
  @MaxLength(255)
  email?: string;

  @IsOptional()
  @IsEnum(UserRole, { message: 'Role must be ADMIN or USER' })
  role?: UserRole;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  avatarUrl?: string;
}
