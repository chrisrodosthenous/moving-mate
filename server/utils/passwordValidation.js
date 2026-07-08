/** Shared password rules (must match Angular auth UX). */
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_HAS_UPPER = /[A-Z]/;
const PASSWORD_HAS_NUMBER = /\d/;
const PASSWORD_HAS_SPECIAL = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/;

/**
 * @param {string} password
 * @returns {string | null} Error message or null if valid.
 */
function validatePassword(password) {
  if (!password || password.length < PASSWORD_MIN_LENGTH) {
    return 'Password must be at least 8 characters';
  }
  if (!PASSWORD_HAS_UPPER.test(password)) {
    return 'Password must include at least one uppercase letter';
  }
  if (!PASSWORD_HAS_NUMBER.test(password)) {
    return 'Password must include at least one number';
  }
  if (!PASSWORD_HAS_SPECIAL.test(password)) {
    return 'Password must include at least one special character';
  }
  return null;
}

module.exports = {
  validatePassword,
  PASSWORD_MIN_LENGTH,
};
