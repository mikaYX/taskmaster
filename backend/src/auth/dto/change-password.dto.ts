import { IsString } from 'class-validator';
import { IsStrongPassword, IsNotCommonPassword } from '../../common/validators';

/**
 * DTO for password change.
 * Validates new password has minimum 8 characters.
 */
export class ChangePasswordDto {
  @IsString()
  @IsString()
  @IsStrongPassword()
  @IsNotCommonPassword()
  password!: string;
}
