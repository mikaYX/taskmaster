import { NotificationChannelType } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';

export class CreateNotificationChannelDto {
  @IsEnum(NotificationChannelType)
  type: NotificationChannelType;

  @IsString()
  name: string;

  /**
   * Configuration as an object, which will be stringified and encrypted by the service.
   */
  @IsOptional()
  config?: any;

  @IsBoolean()
  @IsOptional()
  enabled?: boolean;
}

export class UpdateNotificationChannelDto {
  @IsEnum(NotificationChannelType)
  @IsOptional()
  type?: NotificationChannelType;

  @IsString()
  @IsOptional()
  name?: string;

  @IsOptional()
  config?: any;

  @IsBoolean()
  @IsOptional()
  enabled?: boolean;
}
