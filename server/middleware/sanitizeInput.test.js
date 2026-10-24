const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { sanitizeInPlace } = require('./sanitizeInput');

describe('sanitizeInPlace', () => {
  it('removes Mongo operator keys and dotted keys without replacing the object', () => {
    const body = {
      email: 'a@b.com',
      $gt: 'drop-me',
      'profile.name': 'dotted',
      nested: { $where: '1==1', keep: 'yes' },
    };
    sanitizeInPlace(body, 0);
    assert.equal(body.email, 'a@b.com');
    assert.equal(Object.hasOwn(body, '$gt'), false);
    assert.equal(Object.hasOwn(body, 'profile.name'), false);
    assert.equal(body.nested.keep, 'yes');
    assert.equal(Object.hasOwn(body.nested, '$where'), false);
  });
});
