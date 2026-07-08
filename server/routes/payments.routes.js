const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const {
  postCheckoutSession,
  postConfirmPayment,
  getPaymentStatus,
} = require('../controllers/paymentController');

const router = express.Router();

router.use(authMiddleware);

router.post('/checkout/:orderId', postCheckoutSession);
router.post('/confirm/:orderId', postConfirmPayment);
router.get('/status/:orderId', getPaymentStatus);

module.exports = router;
