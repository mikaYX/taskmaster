import { IsString, MaxLength } from 'class-validator';
import { IsStrongPassword, IsNotCommonPassword } from '../../common/validators';

/**
 * DTO for password change.
 * Validates new password is strong, not a common password, and within bounds
 * (max 128 chars; bcrypt truncates at 72 bytes anyway).
 */
export class ChangePasswordDto {
  @IsString()
  @MaxLength(128, { message: 'Password too long' })
  @IsStrongPassword()
  @IsNotCommonPassword()
  password!: string;
}
