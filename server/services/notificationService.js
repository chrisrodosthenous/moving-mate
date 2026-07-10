/**
 * Email templates + transactional mail. Browser/mobile FCM (drivers, customers, admins) is implemented
 * in pushNotificationService.js — look there for sendNewOrderToDriversPush, sendPush, and driver targeting logs.
 */
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const Handlebars = require('handlebars');
const { isNotificationEnabled } = require('./notificationSettingsService');

const templatesDir = path.join(__dirname, '..', 'templates', 'emails');
const defaultFrom = process.env.EMAIL_FROM || 'Moving Mate <noreply@movingmate.com>';

/**
 * SendGrid API key from SENDGRID_API_KEY or SMTP_PASS when using SendGrid (user=apikey).
 * Render free tier blocks outbound SMTP ports 25/465/587 — HTTP API (443) still works.
 */
function isRenderRuntime() {
  return Boolean(
    process.env.RENDER ||
    process.env.RENDER_EXTERNAL_URL ||
    process.env.RENDER_SERVICE_ID,
  );
}

function resolveSendGridApiKey() {
  const explicit = String(process.env.SENDGRID_API_KEY || '').trim();
  if (explicit) return explicit;
  const pass = String(process.env.SMTP_PASS || process.env.EMAIL_PASS || '').trim();
  if (!pass) return '';
  const transport = String(process.env.EMAIL_TRANSPORT || '').trim().toLowerCase();
  const user = String(process.env.SMTP_USER || process.env.EMAIL_USER || '').trim();
  const host = String(process.env.SMTP_HOST || process.env.EMAIL_HOST || '').toLowerCase();
  if (transport === 'sendgrid_api') return pass;
  if (pass.startsWith('SG.')) return pass;
  if (user === 'apikey' || host.includes('sendgrid')) return pass;
  return '';
}

/** Use SendGrid HTTP API when a key is available (required on Render free tier). */
function shouldUseSendGridApi() {
  const transport = String(process.env.EMAIL_TRANSPORT || '').trim().toLowerCase();
  if (transport === 'smtp') return false;
  const key = resolveSendGridApiKey();
  if (!key) return false;
  if (transport === 'sendgrid_api') return true;
  if (process.env.NODE_ENV === 'production') return true;
  return isRenderRuntime();
}

function parseEmailFrom(raw) {
  const s = String(raw || defaultFrom).trim();
  const m = /^(.+?)\s*<([^>]+)>$/.exec(s);
  if (m) return { name: m[1].trim(), email: m[2].trim() };
  return { email: s, name: '' };
}

async function sendViaSendGridApi({ to, subject, html, text }) {
  const apiKey = resolveSendGridApiKey();
  if (!apiKey) throw new Error('SendGrid API key missing (SENDGRID_API_KEY or SMTP_PASS).');

  const from = parseEmailFrom(defaultFrom);
  const content = [];
  if (text) content.push({ type: 'text/plain', value: text });
  content.push({ type: 'text/html', value: html });

  const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: String(to).trim() }] }],
      from: from.name ? { email: from.email, name: from.name } : { email: from.email },
      subject,
      content,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`SendGrid API ${res.status}: ${errBody.slice(0, 400)}`);
  }

  return {
    messageId: res.headers.get('x-message-id') || 'sendgrid',
    accepted: [String(to).trim()],
  };
}

/** Base URL for email links (no trailing slash). Defaults to Angular dev server port. */
function clientBaseUrl() {
  const raw = (process.env.CLIENT_URL || 'http://localhost:4200').trim();
  return raw.replace(/\/$/, '');
}

let transporter = null;
let transporterInitPromise = null;
const templateCache = new Map();

function loadTemplate(templateName) {
  const cacheKey = templateName;
  const isDev = process.env.NODE_ENV === 'development';
  if (!isDev && templateCache.has(cacheKey)) return templateCache.get(cacheKey);

  const templatePath = path.join(templatesDir, `${templateName}.hbs`);
  let source;
  try {
    source = fs.readFileSync(templatePath, 'utf8');
  } catch (err) {
    throw new Error(`Email template file missing or unreadable: ${templateName} (${err.message})`);
  }
  let compiled;
  try {
    compiled = Handlebars.compile(source);
  } catch (err) {
    throw new Error(`Email template compile failed: ${templateName} (${err.message})`);
  }
  if (!isDev) templateCache.set(cacheKey, compiled);
  return compiled;
}

function renderTemplate(templateName, data) {
  try {
    const compiled = loadTemplate(templateName);
    return compiled(data || {});
  } catch (err) {
    throw err;
  }
}

async function createTransporter() {
  try {
    const isDev = process.env.NODE_ENV === 'development';
    const smtpHost = process.env.SMTP_HOST || process.env.EMAIL_HOST;
    const smtpPort = Number(process.env.SMTP_PORT || process.env.EMAIL_PORT || 587);
    const smtpUser = process.env.SMTP_USER || process.env.EMAIL_USER;
    const smtpPass = process.env.SMTP_PASS || process.env.EMAIL_PASS;

    if (isDev) {
      let account = null;
      try {
        account = await nodemailer.createTestAccount();
      } catch (e) {
        console.warn('[NotificationService] createTestAccount failed, using env SMTP only:', e.message);
      }
      const user = smtpUser || account?.user;
      const pass = smtpPass || account?.pass;
      const host = smtpHost || 'smtp.ethereal.email';
      const port = smtpPort || 587;
      if (!user || !pass) {
        throw new Error('Development SMTP: set SMTP_USER/SMTP_PASS or ensure Ethereal createTestAccount works.');
      }

      console.log('[NotificationService] Development mode: using SMTP account', {
        host,
        port,
        user,
      });

      return nodemailer.createTransport({
        host,
        port,
        secure: false,
        auth: { user, pass },
      });
    }

    if (!smtpHost || !smtpPort || !smtpUser || !smtpPass) {
      throw new Error('SMTP configuration missing. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS.');
    }

    return nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: Number(smtpPort) === 465,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });
  } catch (err) {
    console.error('[NotificationService] createTransporter failed:', err.message);
    throw err;
  }
}

async function getTransporter() {
  if (transporter) return transporter;
  if (!transporterInitPromise) {
    transporterInitPromise = createTransporter()
      .then((t) => {
        transporter = t;
        return t;
      })
      .finally(() => {
        transporterInitPromise = null;
      });
  }
  return transporterInitPromise;
}

async function initNotificationService() {
  const apiKey = resolveSendGridApiKey();
  const onRender = isRenderRuntime();

  if (shouldUseSendGridApi()) {
    console.log(
      '[NotificationService] SendGrid HTTP API transport ready (SMTP verify skipped; uses HTTPS port 443).',
    );
    return;
  }

  if (onRender && process.env.NODE_ENV === 'production') {
    console.error(
      '[NotificationService] Render blocks SMTP ports 25/465/587. Add SENDGRID_API_KEY or SMTP_PASS (your SG.* API key) in the Render dashboard → Environment.',
    );
    return;
  }

  const verifyTimeoutMs = Number(process.env.SMTP_VERIFY_TIMEOUT_MS || 10_000);
  try {
    const transport = await getTransporter();
    await Promise.race([
      transport.verify(),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`SMTP verify timed out after ${verifyTimeoutMs}ms`)), verifyTimeoutMs);
      }),
    ]);
    console.log('[NotificationService] SMTP transporter initialized successfully.');
  } catch (err) {
    console.error('[NotificationService] Initialization failed:', err.message);
    console.warn(
      '[NotificationService] Server will continue without verified SMTP; fix SMTP_* env vars to enable email.',
    );
  }
}

async function verifySmtpHealthy() {
  if (shouldUseSendGridApi()) return Boolean(resolveSendGridApiKey());
  try {
    const transport = await getTransporter();
    await transport.verify();
    return true;
  } catch {
    return false;
  }
}

async function sendTemplateEmail({ to, subject, template, data, text, notificationEvent }) {
  if (!to || !subject || !template) {
    throw new Error('sendTemplateEmail requires to, subject and template');
  }
  if (!String(to).trim()) {
    console.warn('[NotificationService] sendTemplateEmail skipped: empty recipient address');
    throw new Error('Email recipient (to) cannot be empty');
  }

  if (notificationEvent) {
    const ok = await isNotificationEnabled(notificationEvent);
    if (!ok) {
      console.log('[NotificationService] Notification skipped by Admin:', notificationEvent);
      return null;
    }
  }

  let html;
  try {
    html = renderTemplate(template, data);
  } catch (err) {
    console.error('[NotificationService] Template render error:', err.message);
    throw err;
  }

  try {
    let info;
    if (shouldUseSendGridApi()) {
      info = await sendViaSendGridApi({
        to: String(to).trim(),
        subject,
        html,
        text: text || '',
      });
    } else {
      const transport = await getTransporter();
      info = await transport.sendMail({
        from: defaultFrom,
        to: String(to).trim(),
        subject,
        text: text || '',
        html,
      });
    }

    if (process.env.NODE_ENV === 'development') {
      const previewUrl = nodemailer.getTestMessageUrl(info);
      if (previewUrl) {
        console.log(`[NotificationService] Ethereal preview for "${subject}": ${previewUrl}`);
      }
    }

    return info;
  } catch (err) {
    console.error('[NotificationService] Email send failed:', err.message);
    throw new Error(`Failed to send email: ${err.message}`);
  }
}

/**
 * Forgot-password link email (customer / driver accounts).
 * @param {{ to: string, firstName?: string, resetUrl: string }} params
 */
async function sendPasswordResetEmail({ to, firstName, resetUrl }) {
  if (!to || !resetUrl) {
    throw new Error('sendPasswordResetEmail requires to and resetUrl');
  }
  const safeName = (firstName || 'there').trim() || 'there';
  return sendTemplateEmail({
    to,
    subject: 'Reset your password — Moving Mate',
    template: 'password-reset',
    data: {
      firstName: safeName,
      resetUrl,
      expiresIn: '1 hour',
    },
    text: `Hi ${safeName}, reset your Moving Mate password using this link (expires in 1 hour): ${resetUrl}`,
  });
}

async function sendDriverVerificationEmail({ to, firstName, status, dashboardUrl, rejectionReason }) {
  if (!to || !status) return;
  const safeName = firstName || 'Driver';
  const base = (dashboardUrl || clientBaseUrl()).replace(/\/$/, '');

  if (status === 'approved') {
    const sendAccount = await isNotificationEnabled('email_account_verified');
    const sendWelcome = await isNotificationEnabled('email_driver_welcome');
    let last = null;
    if (sendAccount) {
      last = await sendTemplateEmail({
      to,
      subject: 'Account Verified - Moving Mate',
        template: 'account-verified',
        data: {
          firstName: safeName,
          dashboardUrl: base,
        },
        text: `Hello ${safeName}, your driver account has been verified. Login: ${base}/dashboard`,
        notificationEvent: 'email_account_verified',
      });
    }
    if (sendWelcome) {
      last = await sendTemplateEmail({
        to,
        subject: 'Welcome to Moving Mate',
        template: 'driver-welcome',
      data: {
        firstName: safeName,
          dashboardUrl: base,
      },
        text: `Hello ${safeName}, welcome to Moving Mate. Dashboard: ${base}/dashboard`,
        notificationEvent: 'email_driver_welcome',
    });
    }
    return last;
  }

  const reason = String(rejectionReason || '').trim();
  return sendTemplateEmail({
    to,
    subject: 'Verification Update - Moving Mate',
    template: 'driver-rejection',
    data: {
      firstName: safeName,
      profileUrl: `${base}/profile`,
      rejectionReason: reason,
    },
    text: reason
      ? `Hello ${safeName}, your verification was not approved. Reason: ${reason}. Please update your profile: ${base}/profile`
      : `Hello ${safeName}, your verification was not approved. Please update your profile: ${base}/profile`,
    notificationEvent: 'email_driver_rejection',
  });
}

async function sendOrderConfirmationEmail({
  to,
  firstName,
  orderId,
  pickupAddress,
  dropoffAddress,
  smallBoxes,
  mediumBoxes,
  largeBoxes,
  price,
}) {
  if (!to) return;
  const s = Number(smallBoxes || 0);
  const m = Number(mediumBoxes || 0);
  const l = Number(largeBoxes || 0);
  const totalBoxes = s + m + l;

  return sendTemplateEmail({
    to,
    subject: `Order Confirmation - ${orderId}`,
    template: 'order-confirmation',
    data: {
      firstName: firstName || 'Customer',
      orderId,
      pickupAddress,
      dropoffAddress,
      smallBoxes: s,
      mediumBoxes: m,
      largeBoxes: l,
      totalBoxes,
      price,
    },
    text: `Order ${orderId} confirmed. Pickup: ${pickupAddress}. Dropoff: ${dropoffAddress}. Boxes: S:${s}, M:${m}, L:${l}. Total: €${price}.`,
    notificationEvent: 'email_order_confirmation',
  });
}

async function sendDeliverySuccessful({
  to,
  firstName,
  orderId,
  pickupAddress,
  dropoffAddress,
  price,
}) {
  if (!to) return;
  return sendTemplateEmail({
    to,
    subject: `Delivery Successful - ${orderId}`,
    template: 'delivery-successful',
    data: {
      firstName: firstName || 'Customer',
      orderId,
      pickupAddress,
      dropoffAddress,
      price,
    },
    text: `Order ${orderId} was delivered successfully. Pickup: ${pickupAddress}. Dropoff: ${dropoffAddress}. Total: EUR ${price}.`,
  });
}

async function sendInTransit({
  to,
  firstName,
  orderId,
  pickupAddress,
  dropoffAddress,
}) {
  if (!to) return;
  return sendTemplateEmail({
    to,
    subject: `Order In Transit - ${orderId}`,
    template: 'order-in-transit',
    data: {
      firstName: firstName || 'Customer',
      orderId,
      pickupAddress,
      dropoffAddress,
    },
    text: `Order ${orderId} is now in transit. Pickup: ${pickupAddress}. Dropoff: ${dropoffAddress}.`,
  });
}

async function sendDriverAcceptedEmailPayload({
  to,
  firstName,
  orderId,
  driverName,
  driverDisplayName,
  vehicleDetails,
  pickupAddress,
  dropoffAddress,
  trackUrl,
}) {
  if (!to) return;
  const dName = driverName || '—';
  const vInfo = vehicleDetails || 'Not provided';
  const display = (driverDisplayName || '').trim();
  const mainLine = display
    ? `Order Accepted! Your driver ${display} has been assigned to your order.`
    : 'Order Accepted! Your driver has been assigned to your order.';
  return sendTemplateEmail({
    to,
    subject: `Order Accepted - ${orderId}`,
    template: 'driver-accepted',
    data: {
      firstName: firstName || 'Customer',
      orderId,
      driverName: dName,
      driverDisplayName: display,
      vehicleDetails: vInfo,
      pickupAddress,
      dropoffAddress,
      trackUrl: trackUrl || `${clientBaseUrl()}/dashboard`,
    },
    text: `${mainLine} Vehicle: ${vInfo}.`,
    notificationEvent: 'email_order_accepted',
  });
}

/**
 * @param {object} order - TransportOrder (for id + addresses)
 * @param {object|null} customerUser - Client user from DB (email, firstName)
 * @param {object|null} driverUser - Driver user from DB (name)
 * @param {string} [vehicleInfo] - Vehicle description; defaults if missing in app data
 */
async function sendDriverAcceptedEmail(order, customerUser, driverUser, vehicleInfo = 'Not provided') {
  if (!customerUser?.email) return;
  const driverDisplayName = driverUser
    ? [driverUser.firstName, driverUser.lastName].filter(Boolean).join(' ').trim()
    : '';
  const orderId = String(order._id || '');
  return sendDriverAcceptedEmailPayload({
    to: customerUser.email,
    firstName: customerUser.firstName || 'Customer',
    orderId,
    driverName: driverDisplayName || '—',
    driverDisplayName,
    vehicleDetails: vehicleInfo,
    pickupAddress: order.pickupLocation?.address || '',
    dropoffAddress: order.dropoffLocation?.address || '',
    trackUrl: `${clientBaseUrl()}/dashboard`,
  });
}

async function send24hReminderEmail({
  to,
  firstName,
  orderId,
  scheduledAt,
  pickupAddress,
  dropoffAddress,
}) {
  if (!to) return;
  return sendTemplateEmail({
    to,
    subject: `24h Reminder - Order ${orderId}`,
    template: 'order-reminder-24h',
    data: {
      firstName: firstName || 'Customer',
      orderId,
      scheduledAt,
      pickupAddress,
      dropoffAddress,
    },
    text: `Reminder: Order ${orderId} is scheduled at ${scheduledAt}.`,
    notificationEvent: 'email_reminder_24h',
  });
}

async function sendOrderCompletedEmailPayload({
  to,
  firstName,
  orderId,
  pickupAddress,
  dropoffAddress,
  price,
  invoiceUrl,
}) {
  if (!to) return;
  const amount = price != null ? String(price) : '0';
  return sendTemplateEmail({
    to,
    subject: `Order Completed - ${orderId}`,
    template: 'order-completed',
    data: {
      firstName: firstName || 'Customer',
      orderId,
      pickupAddress,
      dropoffAddress,
      price,
      invoiceUrl: invoiceUrl || `${clientBaseUrl()}/dashboard`,
    },
    text: `Order Completed. Thank you for using Moving Mate! Total Amount: ${amount}.`,
    notificationEvent: 'email_order_completed',
  });
}

/**
 * @param {object} order - TransportOrder (price, addresses)
 * @param {object|null} customerUser - Client from DB (email, firstName); falls back to populated order.customerId
 */
async function sendOrderCompletedEmail(order, customerUser) {
  const fromDb = customerUser && customerUser.email ? customerUser : null;
  const fromPopulate =
    order?.customerId && typeof order.customerId === 'object' && order.customerId.email ? order.customerId : null;
  const customer = fromDb || fromPopulate;
  if (!customer?.email) return;
  const orderId = String(order._id || '');
  return sendOrderCompletedEmailPayload({
    to: customer.email,
    firstName: customer.firstName || 'Customer',
    orderId,
    pickupAddress: order.pickupLocation?.address || '',
    dropoffAddress: order.dropoffLocation?.address || '',
    price: order.price || 0,
    invoiceUrl: `${clientBaseUrl()}/dashboard`,
  });
}

async function sendPaymentCapturedEmail({
  to,
  firstName,
  orderId,
  amount,
  driverName,
}) {
  if (!to) return;
  const base = clientBaseUrl();
  const amt = typeof amount === 'number' ? amount.toFixed(2) : String(amount ?? '0.00');
  return sendTemplateEmail({
    to,
    subject: `Payment captured — Order ${orderId}`,
    template: 'payment-captured',
    data: {
      firstName: firstName || 'Customer',
      orderId: String(orderId),
      amount: amt,
      driverName: driverName || 'Your driver',
      ordersUrl: `${base}/customer/orders`,
    },
    text: `Hello ${firstName || 'Customer'}, EUR ${amt} was captured for order ${orderId}. Driver: ${driverName || 'assigned'}.`,
    notificationEvent: 'email_payment_captured',
  });
}

async function sendWithdrawalCompletedEmail({
  to,
  firstName,
  amount,
  remainingBalance,
  payoutId,
  recipientLabel = 'wallet',
}) {
  if (!to) return;
  const amt = typeof amount === 'number' ? amount.toFixed(2) : String(amount ?? '0.00');
  const bal =
    typeof remainingBalance === 'number' ? remainingBalance.toFixed(2) : String(remainingBalance ?? '0.00');
  return sendTemplateEmail({
    to,
    subject: 'Withdrawal completed — Moving Mate',
    template: 'withdrawal-completed',
    data: {
      firstName: firstName || 'User',
      amount: amt,
      remainingBalance: bal,
      payoutId: String(payoutId || ''),
      recipientLabel,
    },
    text: `Hello ${firstName || 'User'}, your ${recipientLabel} withdrawal of EUR ${amt} completed. Remaining balance: EUR ${bal}.`,
    notificationEvent: 'email_withdrawal_completed',
  });
}

/**
 * Admin-only: send a sample of the template for `eventName` without checking notification toggles
 * (uses sendTemplateEmail without notificationEvent).
 * @param {string} eventName - NotificationSetting.eventName (email_*)
 * @param {string} to
 */
async function sendAdminTemplateTestForEvent(eventName, to) {
  const addr = String(to || '').trim();
  if (!addr) {
    throw new Error('email is required');
  }
  const base = clientBaseUrl();
  const demoOrderId = 'TEST-ORDER-001';
  const demoPickup = 'Demo Pickup Address';
  const demoDropoff = 'Demo Dropoff Address';
  const s = 2;
  const m = 1;
  const l = 0;

  switch (eventName) {
    case 'email_order_confirmation':
      return sendTemplateEmail({
        to: addr,
        subject: `Order Confirmation - ${demoOrderId}`,
        template: 'order-confirmation',
        data: {
          firstName: 'Test',
          orderId: demoOrderId,
          pickupAddress: demoPickup,
          dropoffAddress: demoDropoff,
          smallBoxes: s,
          mediumBoxes: m,
          largeBoxes: l,
          totalBoxes: s + m + l,
          price: '49.90',
          driverName: 'Test Driver',
        },
        text: `Test email for order ${demoOrderId}.`,
      });
    case 'email_driver_welcome':
      return sendTemplateEmail({
        to: addr,
        subject: 'Welcome to Moving Mate',
        template: 'driver-welcome',
        data: { firstName: 'Test', dashboardUrl: base },
        text: 'Hello Test, test email (driver-welcome template).',
      });
    case 'email_driver_rejection':
      return sendTemplateEmail({
        to: addr,
        subject: 'Verification Update - Moving Mate',
        template: 'driver-rejection',
        data: {
          firstName: 'Test',
          profileUrl: `${base}/profile`,
          rejectionReason: 'Demo rejection reason (test only).',
        },
        text: 'Hello Test, test email (driver-rejection template).',
      });
    case 'email_verification_update':
      return sendTemplateEmail({
        to: addr,
        subject: 'Verification Update - Moving Mate',
        template: 'verification-update',
        data: {
          firstName: 'Test',
          updateTitle: 'We reviewed your documents',
          updateBody:
            'This is a sample general verification update. Your application status may change as we complete review.',
          actionUrl: `${base}/profile`,
          actionLabel: 'View profile',
        },
        text: 'Hello Test, verification update (sample).',
      });
    case 'email_account_verified':
      return sendTemplateEmail({
        to: addr,
        subject: 'Account Verified - Moving Mate',
        template: 'account-verified',
        data: { firstName: 'Test', dashboardUrl: base },
        text: 'Hello Test, test email (account-verified template).',
      });
    case 'email_reminder_24h':
      return sendTemplateEmail({
        to: addr,
        subject: `24h Reminder - Order ${demoOrderId}`,
        template: 'order-reminder-24h',
        data: {
          firstName: 'Test',
          orderId: demoOrderId,
          scheduledAt: 'Tomorrow 10:00 AM',
          pickupAddress: demoPickup,
          dropoffAddress: demoDropoff,
        },
        text: `Reminder: Order ${demoOrderId} is scheduled.`,
      });
    case 'email_order_accepted':
      return sendTemplateEmail({
        to: addr,
        subject: `Order Accepted - ${demoOrderId}`,
        template: 'driver-accepted',
        data: {
          firstName: 'Test',
          orderId: demoOrderId,
          driverName: 'Test Driver',
          driverDisplayName: 'Test Driver',
          vehicleDetails: 'Demo van — test',
          pickupAddress: demoPickup,
          dropoffAddress: demoDropoff,
          trackUrl: `${base}/dashboard`,
        },
        text: 'Test: order accepted email.',
      });
    case 'email_order_completed':
      return sendTemplateEmail({
        to: addr,
        subject: `Order Completed - ${demoOrderId}`,
        template: 'order-completed',
        data: {
          firstName: 'Test',
          orderId: demoOrderId,
          pickupAddress: demoPickup,
          dropoffAddress: demoDropoff,
          price: '49.90',
          invoiceUrl: `${base}/dashboard`,
        },
        text: 'Test: order completed email.',
      });
    case 'email_payment_captured':
      return sendTemplateEmail({
        to: addr,
        subject: `Payment captured — Order ${demoOrderId}`,
        template: 'payment-captured',
        data: {
          firstName: 'Test',
          orderId: demoOrderId,
          amount: '49.90',
          driverName: 'Test Driver',
          ordersUrl: `${base}/customer/orders`,
        },
        text: 'Test: payment captured email.',
      });
    case 'email_withdrawal_completed':
      return sendTemplateEmail({
        to: addr,
        subject: 'Withdrawal completed — Moving Mate',
        template: 'withdrawal-completed',
        data: {
          firstName: 'Test',
          amount: '25.00',
          remainingBalance: '15.00',
          payoutId: 'TEST-PAYOUT-001',
          recipientLabel: 'driver wallet',
        },
        text: 'Test: withdrawal completed email.',
      });
    default:
      throw new Error(`No test template mapped for event: ${eventName}`);
  }
}

/**
 * Admin dashboard: send a sample transactional email for a named scenario (uses real templates).
 * @param {string} scenario - welcome_signup | order_confirmation | driver_assigned | receipt_invoice | password_reset
 * @param {string} to
 * @param {string} [firstName]
 */
async function sendAdminScenarioEmail(scenario, to, firstName = 'Test') {
  const s = String(scenario || '').trim();
  const fn = String(firstName || 'Test').trim() || 'Test';
  const base = clientBaseUrl();

  switch (s) {
    case 'welcome_signup':
      return sendTemplateEmail({
        to,
        subject: 'Welcome to Moving Mate',
        template: 'driver-welcome',
        data: { firstName: fn, dashboardUrl: base },
        text: `Hello ${fn}, welcome to Moving Mate (sample signup email).`,
      });
    case 'order_confirmation':
      return sendAdminTemplateTestForEvent('email_order_confirmation', to);
    case 'driver_assigned':
      return sendAdminTemplateTestForEvent('email_order_accepted', to);
    case 'receipt_invoice':
      return sendAdminTemplateTestForEvent('email_order_completed', to);
    case 'password_reset':
      return sendTemplateEmail({
        to,
        subject: 'Reset your password — Moving Mate',
        template: 'password-reset',
        data: {
          firstName: fn,
          resetUrl: `${base}/login`,
          expiresIn: '1 hour',
        },
        text: `Hi ${fn}, use this link to reset your password: ${base}/login (sample — link is a placeholder).`,
      });
    default:
      throw new Error(`Unknown email scenario: ${scenario}`);
  }
}

/** Escape user-supplied text for safe inclusion in HTML email bodies. */
function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Marketing website "Contact us" submission. Emails the support inbox
 * (CONTACT_TO, else EMAIL_FROM address) with the visitor's message and
 * sets reply-to so replies go straight back to the sender.
 * @param {{ name: string, email: string, subject?: string, message: string }} params
 */
async function sendContactMessageEmail({ name, email, subject, message }) {
  const senderName = String(name || '').trim();
  const senderEmail = String(email || '').trim();
  const topic = String(subject || '').trim() || 'New contact message';
  const body = String(message || '').trim();
  if (!senderEmail || !body) {
    throw new Error('sendContactMessageEmail requires email and message');
  }

  const to = (process.env.CONTACT_TO || '').trim() || parseEmailFrom(defaultFrom).email;
  const mailSubject = `[Moving Mate] Contact: ${topic}`;
  const text = `New contact message from the website\n\nName: ${senderName || '—'}\nEmail: ${senderEmail}\nSubject: ${topic}\n\n${body}\n`;
  const html = `
    <div style="font-family:Inter,Arial,sans-serif;color:#0f0f0f;">
      <h2 style="margin:0 0 12px;color:#16A34A;">New contact message</h2>
      <p style="margin:0 0 4px;"><strong>Name:</strong> ${escapeHtml(senderName || '—')}</p>
      <p style="margin:0 0 4px;"><strong>Email:</strong> ${escapeHtml(senderEmail)}</p>
      <p style="margin:0 0 12px;"><strong>Subject:</strong> ${escapeHtml(topic)}</p>
      <div style="padding:12px 16px;background:#F0EDE6;border-radius:8px;white-space:pre-wrap;">${escapeHtml(body)}</div>
    </div>`;

  if (shouldUseSendGridApi()) {
    return sendViaSendGridApi({ to, subject: mailSubject, html, text });
  }
  const transport = await getTransporter();
  return transport.sendMail({
    from: defaultFrom,
    to,
    replyTo: senderEmail,
    subject: mailSubject,
    text,
    html,
  });
}

module.exports = {
  clientBaseUrl,
  initNotificationService,
  verifySmtpHealthy,
  sendContactMessageEmail,
  async sendTestEmail(to) {
    return sendTemplateEmail({
      to: to || 'test@example.com',
      subject: 'Moving Mate Test Email',
      template: 'order-confirmation',
      data: {
        firstName: 'Customer',
        orderId: 'TEST-ORDER-001',
        pickupAddress: 'Demo Pickup Address',
        dropoffAddress: 'Demo Dropoff Address',
        smallBoxes: 2,
        mediumBoxes: 1,
        largeBoxes: 0,
        totalBoxes: 3,
        price: '49.90',
        driverName: 'Test Driver',
      },
      text: 'Test email from Moving Mate NotificationService.',
    });
  },
  sendTemplateEmail,
  async sendDriverWelcome(driverData) {
    return sendDriverVerificationEmail({
      to: driverData?.to,
      firstName: driverData?.firstName,
      status: 'approved',
      dashboardUrl: driverData?.dashboardUrl,
    });
  },
  sendDriverVerificationEmail,
  async sendOrderConfirmation(orderData) {
    return sendOrderConfirmationEmail(orderData);
  },
  sendOrderConfirmationEmail,
  sendInTransit,
  sendDriverAcceptedEmail,
  send24hReminderEmail,
  sendOrderCompletedEmail,
  sendPaymentCapturedEmail,
  sendWithdrawalCompletedEmail,
  sendDeliverySuccessful,
  sendAdminTemplateTestForEvent,
  sendAdminScenarioEmail,
  sendPasswordResetEmail,
};
