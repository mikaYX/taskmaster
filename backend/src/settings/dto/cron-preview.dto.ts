import { IsOptional, IsString } from 'class-validator';

export class CronPreviewDto {
  @IsString()
  @IsOptional()
  cron?: string;

  @IsString()
  @IsOptional()
  expression?: string;
}
