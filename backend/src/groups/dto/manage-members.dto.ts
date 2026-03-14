import { IsInt, IsArray, ArrayMinSize } from 'class-validator';

/**
 * DTO for managing group membership.
 * Used for adding/removing multiple users.
 */
export class ManageMembersDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'At least one user ID required' })
  @IsInt({ each: true })
  userIds!: number[];
}
