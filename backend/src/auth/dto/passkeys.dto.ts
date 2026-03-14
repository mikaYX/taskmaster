import { IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';

export class RegistrationResponseDto {
  @IsObject()
  @IsNotEmpty()
  response: any;

  @IsString()
  @IsOptional()
  name?: string;
}
export class AuthenticationResponseDto {
  @IsObject()
  @IsNotEmpty()
  response: any;

  @IsString()
  @IsNotEmpty()
  sessionId: string;
}
