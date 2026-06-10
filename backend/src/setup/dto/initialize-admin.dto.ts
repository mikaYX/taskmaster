import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { IsStrongPassword, IsNotCommonPassword } from '../../common/validators';

/**
 * DTO for initializing the first admin user.
 *
 * `MaxLength` bounds protect the bcrypt KDF (CPU) and the validators against
 * payload-amplification DoS — aligned with `LoginDto`, `ChangePasswordDto`
 * and other auth DTOs (AUDIT.md Finding #12).
 */
export class InitializeAdminDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  username!: string;

  @IsString()
  @MaxLength(128)
  @IsStrongPassword()
  @IsNotCommonPassword()
  password!: string;

  /** Initial preference: enable Todo list in sidebar (default true if omitted). */
  @IsOptional()
  @IsBoolean()
  addonsTodolistEnabled?: boolean;
}
