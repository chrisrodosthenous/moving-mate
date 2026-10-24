const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { validatePassword } = require('./passwordValidation');

describe('validatePassword', () => {
  it('accepts a password that meets every rule', () => {
    assert.equal(validatePassword('Audit123!'), null);
  });

  it('rejects short, weak, and empty values', () => {
    assert.match(validatePassword(''), /at least 8/i);
    assert.match(validatePassword('Abc1!'), /at least 8/i);
    assert.match(validatePassword('audit123!'), /uppercase/i);
    assert.match(validatePassword('Audit!!!'), /number/i);
    assert.match(validatePassword('Audit1234'), /special/i);
  });
});
