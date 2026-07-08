const {
  getDriverWalletSummary,
  getPlatformWalletSummary,
  requestDriverWithdrawal,
  requestPlatformWithdrawal,
} = require('../services/paymentService');
const Payout = require('../models/Payout');

/** GET /api/wallet — driver wallet summary. */
async function getMyWallet(req, res, next) {
  try {
    const userId = req.user?.userId ?? req.user?._id;
    if (!userId) return res.status(401).json({ message: 'User not authenticated' });
    if (req.user?.role !== 'driver') {
      return res.status(403).json({ message: 'Only drivers have a wallet' });
    }

    const wallet = await getDriverWalletSummary(userId);
    const recentPayouts = await Payout.find({ userId, recipientType: 'driver' })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    return res.json({ ok: true, wallet, recentPayouts });
  } catch (err) {
    return next(err);
  }
}

/** POST /api/wallet/withdraw — driver mock withdrawal. */
async function postDriverWithdraw(req, res, next) {
  try {
    const userId = req.user?.userId ?? req.user?._id;
    if (!userId) return res.status(401).json({ message: 'User not authenticated' });
    if (req.user?.role !== 'driver') {
      return res.status(403).json({ message: 'Only drivers can withdraw earnings' });
    }

    const amount = Number(req.body?.amount);
    const note = String(req.body?.note ?? '').trim();
    const result = await requestDriverWithdrawal(userId, amount, note);
    if (!result.ok) return res.status(result.status).json({ message: result.message });

    return res.json({
      ok: true,
      payout: result.payout,
      wallet: result.wallet,
    });
  } catch (err) {
    return next(err);
  }
}

/** GET /api/admin/wallet — platform wallet summary. */
async function getPlatformWallet(req, res, next) {
  try {
    const wallet = await getPlatformWalletSummary();
    const recentPayouts = await Payout.find({ recipientType: 'platform' })
      .sort({ createdAt: -1 })
      .limit(15)
      .lean();
    return res.json({ ok: true, wallet, recentPayouts });
  } catch (err) {
    return next(err);
  }
}

/** POST /api/admin/wallet/withdraw — admin mock platform withdrawal. */
async function postPlatformWithdraw(req, res, next) {
  try {
    const adminId = req.user?.userId ?? req.user?._id;
    const amount = Number(req.body?.amount);
    const note = String(req.body?.note ?? '').trim();
    const result = await requestPlatformWithdrawal(adminId, amount, note);
    if (!result.ok) return res.status(result.status).json({ message: result.message });

    return res.json({
      ok: true,
      payout: result.payout,
      wallet: result.wallet,
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  getMyWallet,
  postDriverWithdraw,
  getPlatformWallet,
  postPlatformWithdraw,
};
