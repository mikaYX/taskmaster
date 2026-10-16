import { IsStrongPasswordConstraint } from './is-strong-password.validator';

describe('IsStrongPasswordConstraint', () => {
  const constraint = new IsStrongPasswordConstraint();
  const valid = (p: string) => constraint.validate(p, {} as never);

  it.each([
    'Azertyuiop12!', // uppercase first
    'azertyUiop12!', // uppercase in the middle
    'azertyuiop12!A', // uppercase last
    'azerty-Uiop12', // special char outside !@#$%^&*
    'azertyUiop12_',
    'azerty.Uiop12?',
    'azertyUiop12€',
  ])('accepts %s', (p) => expect(valid(p)).toBe(true));

  it.each([
    ['too short', 'Azerty1!'],
    ['no uppercase', 'azertyuiop12!'],
    ['no lowercase', 'AZERTYUIOP12!'],
    ['no digit', 'Azertyuiopqs!'],
    ['no special char', 'Azertyuiop123'],
    ['empty', ''],
  ])('rejects %s', (_label, p) => expect(valid(p)).toBe(false));
});
