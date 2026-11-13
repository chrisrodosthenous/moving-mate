const { getDriverWalletSummary, getPlatformWalletSummary } = require('../services/paymentService');

/** GET /api/wallet — driver earnings summary. */
async function getMyWallet(req, res, next) {
  try {
    const userId = req.user?.userId ?? req.user?._id;
    if (!userId) return res.status(401).json({ message: 'User not authenticated' });
    if (req.user?.role !== 'driver') {
      return res.status(403).json({ message: 'Only drivers have a wallet' });
    }

    const wallet = await getDriverWalletSummary(userId);
    return res.json({ ok: true, wallet });
  } catch (err) {
    return next(err);
  }
}

/** GET /api/admin/wallet — platform earnings summary. */
async function getPlatformWallet(req, res, next) {
  try {
    const wallet = await getPlatformWalletSummary();
    return res.json({ ok: true, wallet });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  getMyWallet,
  getPlatformWallet,
};
