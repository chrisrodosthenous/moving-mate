/** User routes: GET/PUT profile, driver rating, upload license. All routes require auth. */
const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const { uploadLicense: uploadLicenseMw } = require('../middleware/uploadLicense');
const {
  updateProfile,
  updateProfileDistricts,
  getDriverRating,
  getDriverAnalytics,
  getProfile,
  uploadLicense,
  updateFcmToken,
  removeFcmToken,
  changePassword,
} = require('../controllers/userController');

const router = express.Router();

router.use(authMiddleware);

router.get('/driver-rating', getDriverRating);
router.get('/driver-analytics', getDriverAnalytics);
router.get('/profile', getProfile);
router.put('/profile', updateProfile);
router.patch('/profile', updateProfile);
router.patch('/profile/districts', updateProfileDistricts);
router.post('/change-password', changePassword);
router.post('/update-fcm-token', updateFcmToken);
router.delete('/fcm-token', removeFcmToken);
router.post('/upload-license', uploadLicenseMw.single('license'), uploadLicense);

module.exports = router;
