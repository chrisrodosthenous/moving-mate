const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const {
  buildDedupeKey,
  tryAcquireNotification,
  _resetNotificationDedupeForTests,
} = require('./notificationDedupe');

describe('notificationDedupe', () => {
  beforeEach(() => {
    _resetNotificationDedupeForTests();
  });

  it('buildDedupeKey joins non-empty parts', () => {
    assert.equal(buildDedupeKey('push', 'new_order', 'abc123'), 'push:new_order:abc123');
    assert.equal(buildDedupeKey('push', '', 'abc'), 'push:abc');
  });

  it('tryAcquireNotification allows first call and blocks duplicate within TTL', () => {
    const key = buildDedupeKey('push', 'new_order', 'order-1');
    assert.equal(tryAcquireNotification(key, 5000), true);
    assert.equal(tryAcquireNotification(key, 5000), false);
  });

  it('tryAcquireNotification allows same key after TTL expires', async () => {
    const key = buildDedupeKey('socket', 'new_order_available', 'order-2', 'driver-1');
    assert.equal(tryAcquireNotification(key, 20), true);
    assert.equal(tryAcquireNotification(key, 20), false);
    await new Promise((r) => setTimeout(r, 25));
    assert.equal(tryAcquireNotification(key, 20), true);
  });

  it('empty key always acquires', () => {
    assert.equal(tryAcquireNotification(''), true);
    assert.equal(tryAcquireNotification(''), true);
  });
});
