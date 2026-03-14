import { IsString, IsNotEmpty, Allow } from 'class-validator';

/**
 * DTO for setting a configuration value.
 */
export class SetSettingDto {
  @IsString()
  key!: string;

  @Allow()
  value!: unknown;
}
