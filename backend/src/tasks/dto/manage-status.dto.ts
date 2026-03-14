import { IsDateString, IsIn, IsOptional, IsString } from 'class-validator';

const ALLOWED_STATUSES = ['SUCCESS', 'FAILED', 'MISSING', 'RUNNING'] as const;

export class SetStatusDto {
  @IsDateString(
    {},
    { message: 'date must be a valid ISO 8601 date string (e.g. 2026-03-07)' },
  )
  date: string;

  @IsIn(ALLOWED_STATUSES, {
    message: 'status must be one of: SUCCESS, FAILED, MISSING, RUNNING',
  })
  status: (typeof ALLOWED_STATUSES)[number];

  @IsOptional()
  @IsString()
  comment?: string;
}
