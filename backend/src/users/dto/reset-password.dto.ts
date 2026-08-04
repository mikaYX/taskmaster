import { IsString, MaxLength } from 'class-validator';
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
}
