import { GuestView } from '@prisma/client';
import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsOptional,
} from 'class-validator';

export class CreateGuestsDto {
  /**
   * Which TV links to create for the site: the task board, the analytics, or
   * both. Defaults to the board, which is what a link was before views existed.
   */
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsEnum(GuestView, { each: true })
  views?: GuestView[];
}
