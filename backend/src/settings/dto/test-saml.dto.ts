import { IsNotEmpty, IsString, IsOptional, IsUrl } from 'class-validator';

export class TestSamlDto {
  @IsUrl({ require_tld: false })
  @IsNotEmpty()
  entityId!: string;

  @IsUrl({ protocols: ['https'], require_tld: false })
  @IsNotEmpty()
  ssoUrl!: string;

  @IsString()
  @IsNotEmpty()
  x509!: string;

  @IsUrl({ require_tld: false })
  @IsOptional()
  metadataUrl?: string;
}
