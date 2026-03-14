import { IsArray, IsInt, ArrayMinSize } from 'class-validator';

/**
 * DTO for managing task assignments (users or groups).
 */
export class ManageAssignmentsDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  ids!: number[];
}
