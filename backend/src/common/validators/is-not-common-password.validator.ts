import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

const COMMON_PASSWORDS = new Set([
  'password',
  '123456',
  '12345678',
  '123456789',
  'qwerty',
  'admin',
  'welcome',
  'taskmaster',
]);

@ValidatorConstraint({ async: false })
export class IsNotCommonPasswordConstraint implements ValidatorConstraintInterface {
  validate(password: string, _args: ValidationArguments) {
    if (!password) return false;
    return !COMMON_PASSWORDS.has(password.toLowerCase());
  }

  defaultMessage(_args: ValidationArguments) {
    return 'Password is too common and insecure.';
  }
}

export function IsNotCommonPassword(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsNotCommonPasswordConstraint,
    });
  };
}
