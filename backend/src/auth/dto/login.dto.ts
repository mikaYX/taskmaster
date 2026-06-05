import { IsString, MinLength, MaxLength } from 'class-validator';

/**
 * DTO for user login.
 * Validates username and password presence + caps payload size to prevent DoS
 * (large payload + bcrypt timing side-channel mitigation).
 */
export class LoginDto {
  @IsString()
  @MinLength(1, { message: 'Username is required' })
  @MaxLength(255, { message: 'Username too long' })
  username!: string;

  @IsString()
  @MinLength(1, { message: 'Password is required' })
  @MaxLength(128, { message: 'Password too long' })
  password!: string;
}
