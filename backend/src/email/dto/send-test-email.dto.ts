import { IsString, IsEmail, IsArray, IsOptional } from 'class-validator';

/**
 * DTO for sending a test email.
 */
export class SendTestEmailDto {
  @IsArray()
  @IsEmail({}, { each: true })
  to!: string[];

  @IsOptional()
  @IsString()
  subject?: string;

  @IsOptional()
  @IsString()
  body?: string;
}
