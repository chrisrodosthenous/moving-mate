const { sendContactMessageEmail } = require('../services/notificationService');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_MESSAGE = 5000;

/**
 * POST /api/contact — public marketing "Contact us" form.
 * Validates input and emails the support inbox via the notification service.
 */
async function postContactMessage(req, res) {
  const name = String(req.body?.name || '').trim();
  const email = String(req.body?.email || '').trim();
  const subject = String(req.body?.subject || '').trim();
  const message = String(req.body?.message || '').trim();

  if (!email || !EMAIL_RE.test(email)) {
    return res.status(400).json({ message: 'A valid email address is required.' });
  }
  if (!message) {
    return res.status(400).json({ message: 'Message cannot be empty.' });
  }
  if (message.length > MAX_MESSAGE) {
    return res.status(400).json({ message: 'Message is too long.' });
  }

  try {
    await sendContactMessageEmail({ name, email, subject, message });
    return res.status(200).json({ message: 'Thanks! Your message has been sent.' });
  } catch (err) {
    console.error('[ContactController] Failed to send contact message:', err.message);
    return res
      .status(502)
      .json({ message: 'We could not send your message right now. Please try again later.' });
  }
}

module.exports = { postContactMessage };
