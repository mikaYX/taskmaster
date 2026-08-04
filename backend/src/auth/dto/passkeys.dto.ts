import {
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class RegistrationResponseDto {
  @IsObject()
  @IsNotEmpty()
  response: any;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  name?: string;
}
export class AuthenticationResponseDto {
  @IsObject()
  @IsNotEmpty()
  response: any;

  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  sessionId: string;
}
