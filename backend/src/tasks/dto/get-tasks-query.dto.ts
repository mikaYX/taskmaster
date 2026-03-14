import { Type } from 'class-transformer';
import { IsOptional, IsInt, IsBoolean, IsIn } from 'class-validator';

export class GetTasksQueryDto {
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  includeInactive?: boolean;

  @IsOptional()
  @IsIn(['active', 'inactive'])
  status?: 'active' | 'inactive';

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  filterUserId?: number;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  filterGroupId?: number;
}
