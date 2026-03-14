import {
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsArray,
  IsInt,
  ArrayMinSize,
  ValidateIf,
} from 'class-validator';

export class CreateDelegationDto {
  @IsNotEmpty()
  @IsDateString()
  startAt: string;

  @IsNotEmpty()
  @IsDateString()
  endAt: string;

  @IsOptional()
  @IsString()
  reason?: string;

  @ValidateIf((o) => !o.targetGroupIds || o.targetGroupIds.length === 0)
  @IsArray()
  @IsInt({ each: true })
  @ArrayMinSize(1, {
    message: 'At least one target user or group must be provided',
  })
  targetUserIds?: number[];

  @ValidateIf((o) => !o.targetUserIds || o.targetUserIds.length === 0)
  @IsArray()
  @IsInt({ each: true })
  @ArrayMinSize(1, {
    message: 'At least one target user or group must be provided',
  })
  targetGroupIds?: number[];
}
