import { IsString, IsNotEmpty, IsUrl, IsOptional } from 'class-validator';

export class TestOidcDto {
  @IsUrl({ protocols: ['https'], require_tld: false })
  @IsNotEmpty()
  issuer!: string;

  @IsString()
  @IsNotEmpty()
  clientId!: string;

  @IsString()
  @IsNotEmpty()
  clientSecret!: string;

  @IsString()
  @IsOptional()
  scopes?: string;
}
