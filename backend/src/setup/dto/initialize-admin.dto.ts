import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsTimeZone,
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

  /** Initial preference: default interface language of the instance. */
  @IsOptional()
  @IsIn(['en', 'fr'])
  language?: 'en' | 'fr';

  /** Initial preference: IANA time zone of the scheduler (e.g. `Europe/Paris`). */
  @IsOptional()
  @IsString()
  @IsTimeZone()
  timezone?: string;
}
