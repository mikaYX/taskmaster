import { IsString, IsInt, Min, Max, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

export class GetHolidaysDto {
  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year?: number;
}

export interface Holiday {
  date: string; // YYYY-MM-DD
  name: string;
}

export interface HolidaysResponseDto {
  country: string;
  year: number;
  weekStart: 'MONDAY' | 'SUNDAY';
  holidays: Holiday[];
}
