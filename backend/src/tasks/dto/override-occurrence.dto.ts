import {
  IsString,
  IsIn,
  IsOptional,
  Matches,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
  Validate,
} from 'class-validator';

/**
 * Validation regex for strict YYYY-MM-DD format
 */
const DATE_YYYY_MM_DD_REGEX = /^\d{4}-\d{2}-\d{2}$/;

@ValidatorConstraint({ name: 'IsTargetDateValidForAction', async: false })
export class IsTargetDateValidForActionConstraint implements ValidatorConstraintInterface {
  validate(targetDate: any, args: ValidationArguments) {
    const obj = args.object as any;
    if (obj.action === 'MOVE') {
      return (
        typeof targetDate === 'string' && DATE_YYYY_MM_DD_REGEX.test(targetDate)
      );
    }
    if (obj.action === 'SKIP') {
      return targetDate === undefined;
    }
    return true;
  }

  defaultMessage(args: ValidationArguments) {
    const obj = args.object as any;
    if (obj.action === 'MOVE') {
      return 'targetDate must be provided in YYYY-MM-DD format when action is MOVE';
    }
    return 'targetDate must not be provided when action is SKIP';
  }
}

/**
 * DTO for creating or updating a task occurrence override.
 */
export class OverrideOccurrenceDto {
  @IsString()
  @Matches(DATE_YYYY_MM_DD_REGEX, {
    message: 'originalDate must be in YYYY-MM-DD format',
  })
  originalDate!: string;

  @IsString()
  @IsIn(['MOVE', 'SKIP'])
  action!: 'MOVE' | 'SKIP';

  @Validate(IsTargetDateValidForActionConstraint)
  targetDate?: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
