import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

@ValidatorConstraint({ async: false })
export class IsStrongPasswordConstraint implements ValidatorConstraintInterface {
  validate(password: string, _args: ValidationArguments) {
    if (!password) return false;
    // Min 12 chars, 1 uppercase, 1 lowercase, 1 number, 1 special char
    // (special = any character that is not a letter or digit). Each rule may
    // be satisfied anywhere in the password, not only at the start.
    const strongRegex = new RegExp(
      '^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[^A-Za-z0-9])(?=.{12,})',
    );
    return strongRegex.test(password);
  }

  defaultMessage(_args: ValidationArguments) {
    return 'Password too weak. Must be at least 12 characters, include an uppercase letter, a lowercase letter, a number, and a special character (any character that is not a letter or digit).';
  }
}

export function IsStrongPassword(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsStrongPasswordConstraint,
    });
  };
}
