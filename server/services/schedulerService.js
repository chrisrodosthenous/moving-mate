const cron = require('node-cron');
const TransportOrder = require('../models/TransportOrder');
const { send24hReminderEmail } = require('./notificationService');
const { send30MinReminderPush } = require('./pushNotificationService');
const { activeFcmTokens } = require('../utils/fcmTokens');
let schedulerStarted = false;

const MS_MINUTE = 60 * 1000;
const MS_HOUR = 60 * MS_MINUTE;

/**
 * 24h email and 30m push reminders only run for these statuses.
 * - pending: order created, not yet accepted by a driver — customer still needs the heads-up.
 * - accepted: driver assigned — both sides should get reminders.
 * Excluded (not in this list):
 * - completed / cancelled — job is done or void; never remind.
 * - in_progress — trip already started; scheduled-time reminders are misleading.
 */
const REMINDER_ELIGIBLE_STATUSES = ['pending', 'accepted'];

/** Base match: eligible status only (excludes completed, cancelled, in_progress). */
const STATUS_MATCH = {
  $and: [
    { status: { $nin: ['completed', 'cancelled'] } },
    { status: { $in: REMINDER_ELIGIBLE_STATUSES } },
  ],
};

/**
 * Orders whose scheduledAt falls in [now + minutesMin, now + minutesMax].
 * Used so a slightly late node-cron tick still catches the same wall-clock window.
 */
function scheduledAtRangeFromNow(now, minutesMin, minutesMax) {
  const t0 = now.getTime();
  return {
    $gte: new Date(t0 + minutesMin * MS_MINUTE),
    $lte: new Date(t0 + minutesMax * MS_MINUTE),
  };
}

/** Mongo: array does not contain flag (safe for remindersSent). */
function notYetSent(flag) {
  return { $nor: [{ remindersSent: flag }] };
}

function reminderSelect() {
  return '_id scheduledAt pickupLocation dropoffLocation remindersSent customerId driverId';
}

async function send24hForOrder(order) {
  const commonData = {
    orderId: String(order._id),
    scheduledAt: new Date(order.scheduledAt).toLocaleString(),
    pickupAddress: order.pickupLocation?.address || '',
    dropoffAddress: order.dropoffLocation?.address || '',
  };
  const customer = order.customerId && typeof order.customerId === 'object' ? order.customerId : null;
  const driver = order.driverId && typeof order.driverId === 'object' ? order.driverId : null;

  let allOk = true;
  if (customer?.email) {
    try {
      await send24hReminderEmail({
        to: customer.email,
        firstName: customer.firstName || 'Customer',
        ...commonData,
      });
    } catch (e) {
      allOk = false;
      console.warn('[Scheduler] 24h customer email failed:', e.message);
    }
  }
  if (driver?.email) {
    try {
      await send24hReminderEmail({
        to: driver.email,
        firstName: driver.firstName || 'Driver',
        ...commonData,
      });
    } catch (e) {
      allOk = false;
      console.warn('[Scheduler] 24h driver email failed:', e.message);
    }
  }

  if (!allOk) {
    console.warn(
      `[Scheduler] Not setting reminder_24h for orderId=${order._id} — one or more emails failed (will retry next window)`
    );
    return;
  }

  const sent = new Set(order.remindersSent || []);
  order.remindersSent = [...sent, 'reminder_24h'];
  try {
    await order.save();
    console.log(`[Scheduler] 24h reminders processed for orderId=${order._id}`);
  } catch (e) {
    console.error('[Scheduler] Failed to save reminder_24h flag:', e.message);
  }
}

async function send30mForOrder(order) {
  const commonData = {
    orderId: String(order._id),
  };
  const customer = order.customerId && typeof order.customerId === 'object' ? order.customerId : null;
  const driver = order.driverId && typeof order.driverId === 'object' ? order.driverId : null;

  const customerToks = activeFcmTokens(customer?.fcmTokens || []);
  const driverToks = activeFcmTokens(driver?.fcmTokens || []);
  const needsPush = Boolean(customerToks.length || driverToks.length);

  let pushOk = true;
  try {
    const { customerMessageId, driverMessageId } = await send30MinReminderPush({
      orderId: commonData.orderId,
      customerFcmToken: customerToks,
      driverFcmToken: driverToks,
      customerUserId: customer?._id ? String(customer._id) : undefined,
      driverUserId: driver?._id ? String(driver._id) : undefined,
    });
    if (needsPush && !customerMessageId && !driverMessageId) {
      pushOk = false;
      console.warn(`[Scheduler] 30m: all pushes failed for orderId=${order._id}`);
    }
  } catch (e) {
    pushOk = false;
    console.warn('[Scheduler] 30m push failed:', e.message);
  }

  const shouldMark = !needsPush || pushOk;
  if (!shouldMark) {
    console.warn(
      `[Scheduler] Not setting reminder_30m for orderId=${order._id} — will retry while still in time window`
    );
    return;
  }

  order.remindersSent = [...new Set([...(order.remindersSent || []), 'reminder_30m'])];
  try {
    await order.save();
    console.log(`[Scheduler] 30m reminders processed for orderId=${order._id}`);
  } catch (e) {
    console.error('[Scheduler] Failed to save reminder_30m flag:', e.message);
  }
}

/**
 * Narrow, indexed queries: only orders in the time band + not yet reminded.
 * Windows are wider than one cron minute so a missed/slipped tick still matches on the next run.
 */
async function processReminders() {
  const now = new Date();

  // 24h email: scheduledAt between ~24h−2min and ~24h+2min from now
  const orders24h = await TransportOrder.find({
    ...STATUS_MATCH,
    scheduledAt: scheduledAtRangeFromNow(now, 24 * 60 - 2, 24 * 60 + 2),
    ...notYetSent('reminder_24h'),
  })
    .populate('customerId', 'firstName email fcmTokens')
    .populate('driverId', 'firstName email fcmTokens')
    .select(reminderSelect())
    .exec();

  for (const order of orders24h) {
    if (!order.scheduledAt) continue;
    try {
      await send24hForOrder(order);
    } catch (e) {
      console.error(`[Scheduler] 24h batch item failed orderId=${order._id}:`, e.message);
    }
  }

  // 30m push: scheduledAt between 29 and 31 minutes from now
  const orders30m = await TransportOrder.find({
    ...STATUS_MATCH,
    scheduledAt: scheduledAtRangeFromNow(now, 29, 31),
    ...notYetSent('reminder_30m'),
  })
    .populate('customerId', 'firstName email fcmTokens')
    .populate('driverId', 'firstName email fcmTokens')
    .select(reminderSelect())
    .exec();

  for (const order of orders30m) {
    if (!order.scheduledAt) continue;
    try {
      await send30mForOrder(order);
    } catch (e) {
      console.error(`[Scheduler] 30m batch item failed orderId=${order._id}:`, e.message);
    }
  }
}

function initSchedulerService() {
  if (schedulerStarted) return;
  schedulerStarted = true;
  cron.schedule('* * * * *', async () => {
    try {
      await processReminders();
    } catch (err) {
      console.error('[Scheduler] Reminder processing failed:', err.message);
    }
  });
  console.log('[Scheduler] Initialized: running every minute.');
}

module.exports = {
  initSchedulerService,
  processReminders,
};
