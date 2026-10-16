import { IsString, MaxLength } from 'class-validator';

/** Self-service deliberately permits only the display name. */
export class UpdateProfileDto {
  @IsString()
  @MaxLength(255)
  fullname!: string;
}
