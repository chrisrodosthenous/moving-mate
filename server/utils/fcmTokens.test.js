const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { sanitizeFcmTokens, activeFcmTokens } = require('./fcmTokens');

describe('fcmTokens', () => {
  it('drops empties and duplicates', () => {
    assert.deepEqual(sanitizeFcmTokens(['  aaa  ', '', null, 'aaa', 'bbb']), ['aaa', 'bbb']);
    assert.deepEqual(sanitizeFcmTokens(undefined), []);
  });

  it('only treats tokens longer than 10 characters as sendable', () => {
    const long = 'fcm-token-abcdefghij';
    assert.deepEqual(activeFcmTokens(['short', long, long]), [long]);
  });
});
