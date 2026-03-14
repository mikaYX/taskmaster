import {
  IsString,
  IsNotEmpty,
  IsDateString,
  IsOptional,
  IsEnum,
} from 'class-validator';

export class SetStatusDto {
  @IsDateString()
  @IsNotEmpty()
  date: string;

  @IsString()
  @IsNotEmpty()
  @IsEnum(['SUCCESS', 'FAILED', 'MISSING', 'RUNNING'])
  status: 'SUCCESS' | 'FAILED' | 'MISSING' | 'RUNNING';

  @IsString()
  @IsOptional()
  comment?: string;
}
