const mongoose = require('mongoose');
const NotificationSetting = require('../models/NotificationSetting');
const User = require('../models/User');
const ns = require('../services/notificationSettingsService');
const NotificationService = require('../services/notificationService');
const PushNotificationService = require('../services/pushNotificationService');
const { activeFcmTokens, logFcmDebug } = require('../utils/fcmTokens');

/** Title + body for admin push tests (does not use notification toggles). */
function pushTestCopyForEvent(eventName, label) {
  const map = {
    push_new_order: {
      title: 'New order (test)',
      body: 'Sample: a new order is available in your district.',
    },
    push_order_accepted: {
      title: 'Order accepted (test)',
      body: 'Sample: your driver has been assigned to your order.',
    },
    push_in_transit: {
      title: 'In transit (test)',
      body: 'Sample: your driver is heading to your location.',
    },
    push_order_delivered: {
      title: 'Order delivered (test)',
      body: 'Sample: how was your experience? Tap to rate your driver.',
    },
    push_chat_message: {
      title: 'New chat message (test)',
      body: 'Sample: open the app to read and reply.',
    },
    push_new_chat_message: {
      title: 'New chat message (test)',
      body: 'Sample: open the app to read and reply.',
    },
    push_verification_request: {
      title: 'Driver verification request (test)',
      body: 'Sample: a driver has submitted documents for review.',
    },
  };
  if (map[eventName]) return map[eventName];
  const name = label || eventName;
  return {
    title: `${name} (test)`,
    body: 'Test push from Moving Mate admin panel.',
  };
}

async function getNotificationSettings(req, res, next) {
  try {
    await ns.ensureDefaultSettings();
    const [emailHealthy, pushHealthy] = await Promise.all([
      ns.isEmailInfrastructureOk(),
      Promise.resolve(ns.isPushInfrastructureOk()),
    ]);
    const docs = await NotificationSetting.find().sort({ type: 1, eventName: 1 }).lean();
    const labelMap = new Map(ns.DEFAULT_SETTINGS.map((r) => [r.eventName, r.label]));
    const enrich = (d) => ({
      ...d,
      label: labelMap.get(d.eventName) || d.eventName,
    });
    res.json({
      email: {
        serviceHealthy: emailHealthy,
        items: docs.filter((d) => d.type === 'email').map(enrich),
      },
      push: {
        serviceHealthy: pushHealthy,
        items: docs.filter((d) => d.type === 'push').map(enrich),
      },
    });
  } catch (err) {
    next(err);
  }
}

async function patchNotificationSetting(req, res, next) {
  try {
    const { id } = req.params;
    const { isEnabled } = req.body;
    if (typeof isEnabled !== 'boolean') {
      return res.status(400).json({ message: 'Body must include isEnabled: boolean' });
    }
    const doc = await NotificationSetting.findByIdAndUpdate(
      id,
      { $set: { isEnabled } },
      { returnDocument: 'after' }
    ).lean();
    if (!doc) {
      return res.status(404).json({ message: 'Notification setting not found' });
    }
    ns.invalidateCache();
    const label = ns.labelForEventName(doc.eventName);
    res.json({ success: true, setting: { ...doc, label } });
  } catch (err) {
    next(err);
  }
}

async function postNotificationTest(req, res, next) {
  try {
    const rawType = req.body?.type;
    const type = typeof rawType === 'string' && rawType.trim().toLowerCase() === 'push' ? 'push' : 'email';
    const eventId = req.body?.eventId;

    if (!eventId) {
      return res.status(400).json({ message: 'eventId is required' });
    }
    if (!mongoose.Types.ObjectId.isValid(String(eventId))) {
      return res.status(400).json({ message: 'Invalid eventId' });
    }
    const doc = await NotificationSetting.findById(eventId).lean();
    if (!doc) {
      return res.status(404).json({ message: 'Notification setting not found' });
    }

    // ── Push path ──────────────────────────────────────────────────────────────
    if (type === 'push') {
      if (doc.type !== 'push') {
        return res.status(400).json({ message: 'This row is not a push notification event' });
      }
      if (!ns.isPushInfrastructureOk()) {
        return res.status(503).json({
          message:
            'Firebase service account is not configured. Add server/config/firebase-service-account.json (or FIREBASE_SERVICE_ACCOUNT_PATH) and restart the server.',
        });
      }
      const userId = req.user?.userId;
      if (!userId) {
        return res.status(401).json({ message: 'Authentication required' });
      }
      const user = await User.findById(userId).select('fcmTokens').lean();
      const rawToks = user?.fcmTokens || [];
      const fcmTokens = activeFcmTokens(rawToks);
      logFcmDebug(userId, rawToks, fcmTokens);
      if (!fcmTokens.length) {
        return res.status(400).json({
          message:
            'No FCM tokens found for your current session. Please allow notifications in your browser first.',
        });
      }
      const { title, body } = pushTestCopyForEvent(doc.eventName, ns.labelForEventName(doc.eventName));

      // Accept an optional deep-link URL from the request so admins can test navigation.
      const rawUrl = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
      const pushData = { type: 'admin_push_test', eventName: doc.eventName };
      if (rawUrl) pushData.url = rawUrl;

      const messageId = await PushNotificationService.sendPush(
        fcmTokens,
        title,
        body,
        pushData,
        {}
      );
      if (!messageId) {
        return res.status(502).json({
          message:
            'Push could not be sent. Check Firebase credentials, VAPID / web config, and that your FCM token is still valid.',
        });
      }
      return res.status(200).json({
        success: true,
        message: 'Push sent! Check your device.',
        eventName: doc.eventName,
        url: rawUrl || null,
        messageId,
      });
    }

    // ── Email path ─────────────────────────────────────────────────────────────
    if (doc.type !== 'email') {
      return res.status(400).json({
        message: 'This row is a push event — send type: "push" instead.',
      });
    }
    const email = req.body?.email;
    const template = req.body?.template;
    if (typeof email !== 'string' || !String(email).trim()) {
      return res.status(400).json({ message: 'email is required for email test' });
    }
    if (template != null && String(template).trim() !== '' && String(template).trim() !== doc.eventName) {
      return res.status(400).json({ message: 'template must match this row event name' });
    }
    await NotificationService.sendAdminTemplateTestForEvent(doc.eventName, email.trim());
    return res.status(200).json({
      success: true,
      message: `Test email sent to ${email.trim()}`,
      eventName: doc.eventName,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/admin/notifications/deep-link-test
 * Sends a push notification with an arbitrary URL to the logged-in admin's devices.
 * TEMPORARY — used only to verify deep-linking behaviour during development.
 * Body: { url: string, title?: string, body?: string }
 */
async function postDeepLinkTest(req, res, next) {
  try {
    if (!PushNotificationService.initPushNotificationService && !PushNotificationService.sendPush) {
      return res.status(503).json({ message: 'Push service not available.' });
    }

    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ message: 'Authentication required' });

    const targetUrl  = String(req.body?.url  || '/').trim();
    const title      = String(req.body?.title || 'Deep-link Test').trim().slice(0, 100);
    const body       = String(req.body?.body  || `Tap to navigate to: ${targetUrl}`).trim().slice(0, 300);

    const user = await User.findById(userId).select('fcmTokens').lean();
    const rawToks = user?.fcmTokens || [];
    const fcmTokens = activeFcmTokens(rawToks);
    logFcmDebug(userId, rawToks, fcmTokens);

    console.log(
      `[DeepLinkTest] userId=${userId} | tokens in DB=${fcmTokens.length} | url=${targetUrl}`
    );
    fcmTokens.forEach((t, i) =>
      console.log(`[DeepLinkTest]   [${i}] …${t.slice(-12)}`)
    );

    if (!fcmTokens.length) {
      return res.status(400).json({
        message: 'No FCM tokens found for your session. Allow notifications in the browser first.',
      });
    }

    const messageId = await PushNotificationService.sendPush(
      fcmTokens,
      title,
      body,
      { type: 'deep_link_test', url: targetUrl }
    );

    if (!messageId) {
      return res.status(502).json({ message: 'Push could not be sent. Check Firebase config and token validity.' });
    }

    return res.status(200).json({
      success: true,
      message: 'Test push sent. Check your device/browser.',
      url: targetUrl,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/admin/test/send-email
 * Body: { scenario: 'welcome_signup' | 'order_confirmation' | 'driver_assigned' | 'receipt_invoice' | 'password_reset' }
 * Sends the sample template to the logged-in admin's email (from DB).
 */
async function postAdminTestSendEmail(req, res, next) {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ message: 'Authentication required' });

    const scenario = String(req.body?.scenario || '').trim();
    const allowed = new Set([
      'welcome_signup',
      'order_confirmation',
      'driver_assigned',
      'receipt_invoice',
      'password_reset',
    ]);
    if (!allowed.has(scenario)) {
      return res.status(400).json({ message: 'Invalid or missing scenario.' });
    }

    const user = await User.findById(userId).select('email firstName').lean();
    const to = String(user?.email || '').trim();
    if (!to) {
      return res.status(400).json({
        message: 'Your account has no email on file. Add an email to your profile to receive test messages.',
      });
    }

    await NotificationService.sendAdminScenarioEmail(scenario, to, user.firstName || 'User');

    return res.status(200).json({
      success: true,
      message: `Sample email (${scenario}) sent to ${to}`,
      scenario,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getNotificationSettings,
  patchNotificationSetting,
  postNotificationTest,
  postDeepLinkTest,
  postAdminTestSendEmail,
};
