import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CronPreviewDto {
  @IsString()
  @IsOptional()
  cron?: string;

  @IsString()
  @IsOptional()
  expression?: string;
}
