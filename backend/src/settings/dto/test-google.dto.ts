import { IsNotEmpty, IsString, IsOptional } from 'class-validator';

export class TestGoogleDto {
  @IsString()
  @IsNotEmpty()
  clientId!: string;

  @IsString()
  @IsNotEmpty()
  clientSecret!: string;

  @IsString()
  @IsOptional()
  hostedDomain?: string;
}
