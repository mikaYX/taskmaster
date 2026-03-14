import {
  IsInt,
  IsBoolean,
  IsOptional,
  IsArray,
  IsEmail,
} from 'class-validator';

export class TaskNotificationDto {
  @IsInt()
  channelId: number;

  @IsBoolean()
  @IsOptional()
  notifyOnFailed?: boolean;

  @IsBoolean()
  @IsOptional()
  notifyOnMissing?: boolean;

  @IsBoolean()
  @IsOptional()
  notifyOnReminder?: boolean;

  @IsArray()
  @IsInt({ each: true })
  @IsOptional()
  emailUserIds?: number[];

  @IsArray()
  @IsInt({ each: true })
  @IsOptional()
  emailGroupIds?: number[];

  @IsArray()
  @IsEmail({}, { each: true })
  @IsOptional()
  emailCustom?: string[];
}

export class SaveTaskNotificationsDto {
  @IsArray()
  notifications: TaskNotificationDto[];
}
