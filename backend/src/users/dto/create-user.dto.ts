import {
  IsString,
  IsOptional,
  IsEmail,
  IsEnum,
  IsInt,
  MinLength,
  MaxLength,
} from 'class-validator';
import { IsStrongPassword, IsNotCommonPassword } from '../../common/validators';
import { UserRole } from '@prisma/client';

export class CreateUserDto {
  @IsString()
  @MinLength(3, { message: 'Username must be at least 3 characters' })
  @MaxLength(255)
  username!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  fullname?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Invalid email format' })
  @MaxLength(255)
  email?: string;

  @IsString()
  @IsString()
  @IsStrongPassword()
  @IsNotCommonPassword()
  password!: string;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional()
  @IsInt()
  siteId?: number;
}
