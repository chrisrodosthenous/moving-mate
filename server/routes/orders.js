/**
 * Order routes: create, list (available/mine), update status, complete, summary.
 * All routes except health require auth; /summary and /mine require auth.
 */
const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const { uploadCargo } = require('../middleware/uploadCargo');
const {
  createOrder,
  getOrders,
  updateOrder,
  pickupOrder,
  deliverOrder,
  cancelOrder,
  getMyOrders,
  completeOrder,
  getOrderSummary,
  updateOrderStatus,
  rateOrder,
  uploadOrderCargo,
} = require('../controllers/orderController');
const { createOrderLimiter } = require('../middleware/rateLimiters');

const router = express.Router();

// Specific PATCH/POST routes MUST be above any generic /:id route to avoid 404.
router.patch('/:id/complete', authMiddleware, completeOrder);
router.patch('/:id/status', authMiddleware, updateOrderStatus);
router.patch('/:id/pickup', authMiddleware, pickupOrder);
router.patch('/:id/deliver', authMiddleware, deliverOrder);
router.patch('/:id/cancel', authMiddleware, cancelOrder);
/** Alias: driver accepts job (same as PUT /:id with body { status: 'accepted' }). */
router.patch('/:id/accept', authMiddleware, (req, res, next) => {
  req.body = { status: 'accepted' };
  updateOrder(req, res, next);
});

router.use(authMiddleware);
router.get('/summary', getOrderSummary);
router.get('/mine', getMyOrders);
router.post('/', createOrderLimiter, createOrder);
router.post('/:id/rate', rateOrder);
router.post('/:id/cargo', uploadCargo.single('cargo'), uploadOrderCargo);
router.get('/', getOrders);
router.put('/:id', updateOrder);

module.exports = router;
