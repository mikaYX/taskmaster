import { IsString, MinLength } from 'class-validator';

/**
 * DTO for user login.
 * Validates username and password presence.
 */
export class LoginDto {
  @IsString()
  @MinLength(1, { message: 'Username is required' })
  username!: string;

  @IsString()
  @MinLength(1, { message: 'Password is required' })
  password!: string;
}
