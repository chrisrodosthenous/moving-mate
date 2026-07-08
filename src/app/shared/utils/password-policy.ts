/**
 * Client password rules — aligned with server `passwordValidation.js` and register / profile UX.
 */
export const MIN_LENGTH = 8;
export const REGEX_UPPER = /[A-Z]/;
export const REGEX_NUMBER = /\d/;
export const REGEX_SPECIAL = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/;

/** True when the password satisfies all policy rules. */
export function validatePassword(password: string): boolean {
  return (
    password.length >= MIN_LENGTH &&
    REGEX_UPPER.test(password) &&
    REGEX_NUMBER.test(password) &&
    REGEX_SPECIAL.test(password)
  );
}

/**
 * Human-readable policy gaps for in-form hints (empty password → no messages).
 * Matches register + profile “requirements below” copy.
 */
export function getPasswordPolicyErrors(password: string): string[] {
  const err: string[] = [];
  if (password.length === 0) return [];
  if (password.length < MIN_LENGTH) {
    err.push(`At least ${MIN_LENGTH} characters`);
  }
  if (!REGEX_UPPER.test(password)) {
    err.push('One uppercase letter');
  }
  if (!REGEX_NUMBER.test(password)) {
    err.push('One number');
  }
  if (!REGEX_SPECIAL.test(password)) {
    err.push('One special character (!@#$%^&* etc.)');
  }
  return err;
}
