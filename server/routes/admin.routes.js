const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const { adminMiddleware } = require('../middleware/admin');
const {
  getOverview,
  getAnalytics,
  getPendingVerifications,
  verifyUser,
  getDriverDocument,
  getAdminOrderDetail,
} = require('../controllers/adminController');
const {
  getNotificationSettings,
  patchNotificationSetting,
  postAdminTestSendEmail,
} = require('../controllers/notificationSettingsController');
const { getPlatformWallet, postPlatformWithdraw } = require('../controllers/walletController');

const router = express.Router();

router.use(authMiddleware);
router.use(adminMiddleware);

router.get('/notification-settings', getNotificationSettings);
router.patch('/notification-settings/:id', patchNotificationSetting);
router.post('/test/send-email', postAdminTestSendEmail);

router.get('/overview', getOverview);
router.get('/analytics', getAnalytics);
router.get('/orders/:id', getAdminOrderDetail);
router.get('/pending-verifications', getPendingVerifications);
router.get('/driver-documents/:id/:docType', getDriverDocument);
router.patch('/verify-user/:id', verifyUser);
/** PUT /api/admin/drivers/:id/verify — approve or reject driver (vehicle + license review). */
router.put('/drivers/:id/verify', verifyUser);
/** Alias: approve driver (same as verify-user with status approved). */
router.patch('/verify-driver/:id', (req, res, next) => {
  req.body = { ...req.body, status: 'approved' };
  verifyUser(req, res, next);
});

router.get('/wallet', getPlatformWallet);
router.post('/wallet/withdraw', postPlatformWithdraw);

module.exports = router;
