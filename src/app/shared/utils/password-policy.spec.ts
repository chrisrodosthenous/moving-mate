import { getPasswordPolicyErrors, validatePassword } from './password-policy';

describe('password-policy', () => {
  it('accepts a password that meets every rule', () => {
    expect(validatePassword('Audit123!')).toBe(true);
    expect(getPasswordPolicyErrors('Audit123!')).toEqual([]);
  });

  it('lists the missing rules without inventing a required-empty message', () => {
    expect(validatePassword('abc')).toBe(false);
    expect(getPasswordPolicyErrors('')).toEqual([]);
    expect(getPasswordPolicyErrors('abc')).toEqual(
      jasmine.arrayContaining(['At least 8 characters', 'One uppercase letter', 'One number', 'One special character (!@#$%^&* etc.)']),
    );
  });
});
