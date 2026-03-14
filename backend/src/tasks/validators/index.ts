import { registerDecorator, ValidationOptions } from 'class-validator';
import { IsValidRecurrenceDateConstraint } from './date-recurrence.validator';

export function IsValidRecurrenceDate(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsValidRecurrenceDateConstraint,
    });
  };
}
