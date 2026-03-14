/**
 * Setting response DTO.
 */
export class SettingResponseDto {
  key!: string;
  value!: unknown;
  sensitive!: boolean;
  description!: string;
  updatedAt?: Date;
}
