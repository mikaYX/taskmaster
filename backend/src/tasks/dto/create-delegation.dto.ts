import { IsInt, IsDateString } from 'class-validator';

/**
 * DTO for creating a task delegation.
 */
export class CreateDelegationDto {
  @IsInt()
  delegateUserId!: number;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;
}
