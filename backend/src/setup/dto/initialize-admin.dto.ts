import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { IsStrongPassword, IsNotCommonPassword } from '../../common/validators';

/**
 * DTO for initializing the first admin user.
 */
export class InitializeAdminDto {
  @IsString()
  @IsNotEmpty()
  username!: string;

  @IsString()
  @IsStrongPassword()
  @IsNotCommonPassword()
  password!: string;

  /** Initial preference: enable Todo list in sidebar (default true if omitted). */
  @IsOptional()
  @IsBoolean()
  addonsTodolistEnabled?: boolean;
}
