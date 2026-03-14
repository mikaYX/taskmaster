import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';
import { RRule } from 'rrule';

@ValidatorConstraint({ async: false })
export class IsTimezoneConstraint implements ValidatorConstraintInterface {
  validate(timezone: string, args: ValidationArguments) {
    try {
      // Use Intl to validate timezone
      Intl.DateTimeFormat(undefined, { timeZone: timezone });
      return true;
    } catch (e) {
      return false;
    }
  }

  defaultMessage(args: ValidationArguments) {
    return 'Timezone ($value) is not valid';
  }
}

export function IsTimezone(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsTimezoneConstraint,
    });
  };
}

@ValidatorConstraint({ async: false })
export class IsRRuleConstraint implements ValidatorConstraintInterface {
  validate(rruleString: string, args: ValidationArguments) {
    try {
      if (!rruleString) return false;
      RRule.parseString(rruleString);
      return true;
    } catch (e) {
      return false;
    }
  }

  defaultMessage(args: ValidationArguments) {
    return 'RRule string ($value) is not valid';
  }
}

export function IsRRule(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsRRuleConstraint,
    });
  };
}

@ValidatorConstraint({ async: false })
export class IsHHmmConstraint implements ValidatorConstraintInterface {
  validate(timeString: string, args: ValidationArguments) {
    if (!timeString) return false;
    return /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(timeString);
  }

  defaultMessage(args: ValidationArguments) {
    return 'Time ($value) must be in HH:mm format';
  }
}

export function IsHHmm(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsHHmmConstraint,
    });
  };
}
