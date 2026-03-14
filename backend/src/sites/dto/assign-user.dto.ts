import { IsBoolean, IsOptional } from 'class-validator';

export class AssignUserToSiteDto {
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
