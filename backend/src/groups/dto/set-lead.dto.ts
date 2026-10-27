import { IsBoolean } from 'class-validator';

/** Marks a member of a group as a lead of the team, or takes that back. */
export class SetLeadDto {
  @IsBoolean()
  isLead!: boolean;
}
