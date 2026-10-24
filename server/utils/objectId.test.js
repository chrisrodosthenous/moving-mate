const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { strictMongoObjectIdString } = require('./objectId');

describe('strictMongoObjectIdString', () => {
  it('accepts a real 24-char hex id and an ObjectId instance', () => {
    const hex = '507f1f77bcf86cd799439011';
    assert.equal(strictMongoObjectIdString(hex), hex);
    assert.equal(strictMongoObjectIdString(new mongoose.Types.ObjectId(hex)), hex);
    assert.equal(strictMongoObjectIdString({ _id: hex }), hex);
  });

  it('rejects values mongoose would otherwise coerce', () => {
    assert.equal(strictMongoObjectIdString(null), null);
    assert.equal(strictMongoObjectIdString(''), null);
    assert.equal(strictMongoObjectIdString('not-an-id'), null);
    assert.equal(strictMongoObjectIdString('12charshort'), null);
    assert.equal(strictMongoObjectIdString('507f1f77bcf86cd799439011FFFF'), null);
  });
});
