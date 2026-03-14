import { IsString } from 'class-validator';
import { IsStrongPassword, IsNotCommonPassword } from '../../common/validators';

/**
 * DTO for admin resetting a user's password.
 */
export class ResetPasswordDto {
  @IsString()
  @IsString()
  @IsStrongPassword()
  @IsNotCommonPassword()
  password!: string;
}
