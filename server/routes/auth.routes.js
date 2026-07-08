/** Auth routes: register (firstName, lastName, email, password, phoneNumber, dateOfBirth, role) and login (phone, password). */
const express = require('express');
const authController = require('../controllers/auth.controller');
const { authLoginLimiter, authForgotPasswordLimiter } = require('../middleware/rateLimiters');
const { uploadDriverDocs } = require('../middleware/uploadDriverDocs');

const router = express.Router();

router.post(
  '/register',
  uploadDriverDocs.fields([
    { name: 'idCard', maxCount: 1 },
    { name: 'drivingLicense', maxCount: 1 },
    { name: 'vehiclePhoto', maxCount: 1 },
  ]),
  authController.register
);
router.post(
  '/register-driver',
  uploadDriverDocs.fields([
    { name: 'idCard', maxCount: 1 },
    { name: 'drivingLicense', maxCount: 1 },
    { name: 'vehiclePhoto', maxCount: 1 },
  ]),
  authController.register
);
router.post('/login', authLoginLimiter, authController.login);
router.post('/forgot-password', authForgotPasswordLimiter, authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);

module.exports = router;
