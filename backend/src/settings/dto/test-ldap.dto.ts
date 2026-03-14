import { IsString, IsNotEmpty, IsOptional, IsUrl } from 'class-validator';

export class TestLdapConnectionDto {
  @IsString()
  @IsNotEmpty()
  url: string;

  @IsString()
  @IsOptional()
  bindDn?: string;

  @IsString()
  @IsOptional()
  bindPassword?: string;

  @IsString()
  @IsNotEmpty()
  searchBase: string;

  @IsString()
  @IsOptional()
  searchFilter?: string;
}
