const NotificationSetting = require('../models/NotificationSetting');
const { resolveFirebaseServiceAccountPath } = require('../config/firebaseServiceAccount');

/** Default rows (eventName must stay stable for code checks). */
const DEFAULT_SETTINGS = [
  {
    eventName: 'email_order_confirmation',
    type: 'email',
    label: 'Order Confirmation',
    description: 'Sent to customer when a new order is placed.',
  },
  {
    eventName: 'email_driver_welcome',
    type: 'email',
    label: 'Driver Welcome',
    description: 'Sent to driver when verification is approved.',
  },
  {
    eventName: 'email_driver_rejection',
    type: 'email',
    label: 'Driver Rejection',
    description: 'Sent to driver when verification is rejected.',
  },
  {
    eventName: 'email_verification_update',
    type: 'email',
    label: 'Verification Update',
    description: 'General verification status update to the driver (e.g. documents under review).',
  },
  {
    eventName: 'email_account_verified',
    type: 'email',
    label: 'Account Verified',
    description: 'Success email when driver verification is approved.',
  },
  {
    eventName: 'email_reminder_24h',
    type: 'email',
    label: '24h Reminder',
    description: 'Sent to customer 24 hours before scheduled pickup.',
  },
  {
    eventName: 'email_order_accepted',
    type: 'email',
    label: 'Order accepted (customer email)',
    description: 'Sent to customer when a driver accepts the order.',
  },
  {
    eventName: 'email_order_completed',
    type: 'email',
    label: 'Order completed (customer email)',
    description: 'Sent to customer when the order is marked completed.',
  },
  {
    eventName: 'email_payment_captured',
    type: 'email',
    label: 'Payment captured',
    description: 'Sent to customer when payment is captured after a driver accepts the order.',
  },
  {
    eventName: 'email_withdrawal_completed',
    type: 'email',
    label: 'Withdrawal completed',
    description: 'Sent to driver or admin after a mock wallet withdrawal completes.',
  },
  {
    eventName: 'push_new_order',
    type: 'push',
    label: 'New Order (Drivers)',
    description: 'Push to all verified drivers in the pickup district when a new order is created. Deep-links to /available-orders.',
  },
  {
    eventName: 'push_order_accepted',
    type: 'push',
    label: 'Order Accepted',
    description: 'Push to customer when a driver accepts their order. Deep-links to /my-orders.',
  },
  {
    eventName: 'push_in_transit',
    type: 'push',
    label: 'In Transit',
    description: 'Push to customer when the driver starts the trip. Deep-links to /my-orders.',
  },
  {
    eventName: 'push_order_delivered',
    type: 'push',
    label: 'Order Delivered',
    description: 'Push to customer asking them to rate after delivery. Deep-links to /rate-driver/:id.',
  },
  {
    eventName: 'push_chat_message',
    type: 'push',
    label: 'New Chat Message (legacy key)',
    description: 'Legacy event name; prefer push_new_chat_message.',
  },
  {
    eventName: 'push_new_chat_message',
    type: 'push',
    label: 'New Chat Message',
    description: 'Push when a chat message is sent to the other party. Deep-links to /chat/:orderId.',
  },
  {
    eventName: 'push_verification_request',
    type: 'push',
    label: 'Driver Verification Request',
    description: 'Push to all admin users when a driver uploads documents for review. Deep-links to /admin/verify-drivers.',
  },
];

let cacheEntries = null;
let cacheAt = 0;
const CACHE_MS = 4000;

function invalidateCache() {
  cacheEntries = null;
  cacheAt = 0;
}

async function ensureDefaultSettings() {
  for (const row of DEFAULT_SETTINGS) {
    const { label, ...rest } = row;
    await NotificationSetting.updateOne(
      { eventName: rest.eventName },
      { $setOnInsert: { ...rest, isEnabled: true } },
      { upsert: true }
    );
  }
}

async function loadEnabledMap() {
  const now = Date.now();
  if (cacheEntries && now - cacheAt < CACHE_MS) {
    return cacheEntries;
  }
  await ensureDefaultSettings();
  const docs = await NotificationSetting.find().lean();
  const map = new Map();
  for (const d of docs) {
    map.set(d.eventName, d.isEnabled !== false);
  }
  cacheEntries = map;
  cacheAt = now;
  return map;
}

/**
 * @param {string} eventName
 * @returns {Promise<boolean>}
 */
async function isNotificationEnabled(eventName) {
  if (!eventName) return true;
  const map = await loadEnabledMap();
  if (!map.has(eventName)) return true;
  return map.get(eventName) === true;
}

/** Firebase Admin can initialize (service account file present). */
function isPushInfrastructureOk() {
  return Boolean(resolveFirebaseServiceAccountPath());
}

/** SMTP transporter is usable (best-effort; does not send mail). */
async function isEmailInfrastructureOk() {
  try {
    const { verifySmtpHealthy } = require('./notificationService');
    if (typeof verifySmtpHealthy === 'function') {
      return await verifySmtpHealthy();
    }
    return false;
  } catch {
    return false;
  }
}

function labelForEventName(eventName) {
  const row = DEFAULT_SETTINGS.find((r) => r.eventName === eventName);
  return row?.label || eventName;
}

module.exports = {
  DEFAULT_SETTINGS,
  ensureDefaultSettings,
  invalidateCache,
  isNotificationEnabled,
  loadEnabledMap,
  isPushInfrastructureOk,
  isEmailInfrastructureOk,
  resolveFirebaseServiceAccountPath,
  labelForEventName,
};
