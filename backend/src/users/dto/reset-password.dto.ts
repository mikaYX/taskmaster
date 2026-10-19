import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { IsStrongPassword, IsNotCommonPassword } from '../../common/validators';

/**
 * DTO for admin resetting a user's password.
 */
export class ResetPasswordDto {
  @IsString()
  @MaxLength(128, { message: 'Password too long' })
  @IsStrongPassword()
  @IsNotCommonPassword()
  password!: string;

  /** Email the temporary password to the user (needs an active email setup). */
  @IsOptional()
  @IsBoolean()
  sendEmail?: boolean;
}
