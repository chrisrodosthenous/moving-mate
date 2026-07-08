const mongoose = require('mongoose');
const Review = require('../models/Review');
const TransportOrder = require('../models/TransportOrder');
const User = require('../models/User');

function toObjectId(id) {
  if (id == null) return null;
  if (id instanceof mongoose.Types.ObjectId) return id;
  if (typeof id === 'object' && id._id != null) return toObjectId(id._id);
  const s = String(id).trim();
  if (!s || s === '[object Object]') return null;
  return mongoose.Types.ObjectId.isValid(s) ? new mongoose.Types.ObjectId(s) : null;
}

/**
 * Recompute driver's averageRating, reviewCount, and totalReviews from all Review docs.
 */
async function recalculateDriverStats(driverId) {
  const did = toObjectId(driverId);
  if (!did) return;
  const agg = await Review.aggregate([
    { $match: { driverId: did } },
    { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
  ]);
  const count = agg[0] ? agg[0].count : 0;
  const avg =
    agg[0] && count > 0 ? Math.round(agg[0].avg * 10) / 10 : null;
  await User.findByIdAndUpdate(did, {
    $set: { averageRating: avg, totalReviews: count, reviewCount: count },
  });
}

/**
 * POST /api/reviews
 * Body: { orderId, rating (1-5), comment?: string }
 * Only the order's customer may submit; order must be delivered; one review per order.
 */
async function createReview(req, res, next) {
  try {
    const userId = req.user?.userId ?? req.user?._id;
    if (!userId) {
      return res.status(401).json({ message: 'Not authenticated' });
    }

    const { orderId: rawOrderId, rating: rawRating, comment } = req.body || {};
    const orderIdStr =
      typeof rawOrderId === 'object' && rawOrderId?._id != null
        ? String(rawOrderId._id)
        : String(rawOrderId || '').trim();
    const orderObjId = toObjectId(orderIdStr);
    if (!orderObjId) {
      return res.status(400).json({ message: 'Valid orderId is required' });
    }

    const numRating = typeof rawRating === 'string' ? parseInt(rawRating, 10) : Number(rawRating);
    if (!Number.isInteger(numRating) || numRating < 1 || numRating > 5) {
      return res.status(400).json({ message: 'Rating must be an integer between 1 and 5' });
    }

    const order = await TransportOrder.findById(orderObjId).lean();
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    if (order.status !== 'delivered') {
      return res.status(400).json({
        message: 'You can only review a completed order',
      });
    }

    const customerObjId = toObjectId(userId);
    if (!customerObjId || order.customerId?.toString() !== customerObjId.toString()) {
      return res.status(403).json({ message: 'Only the customer who placed the order can leave a review' });
    }

    const driverObjId = order.driverId ? toObjectId(order.driverId) : null;
    if (!driverObjId) {
      return res.status(400).json({ message: 'Order has no assigned driver' });
    }

    const existing = await Review.findOne({ orderId: orderObjId }).lean();
    if (existing) {
      return res.status(400).json({ message: 'This order has already been reviewed' });
    }

    const commentStr = comment != null ? String(comment).trim() : '';

    const review = new Review({
      orderId: orderObjId,
      customerId: customerObjId,
      driverId: driverObjId,
      rating: numRating,
      comment: commentStr,
    });
    await review.save();

    await recalculateDriverStats(driverObjId);

    const driverFresh = await User.findById(driverObjId)
      .select('averageRating totalReviews reviewCount firstName lastName')
      .lean();

    const rc = driverFresh?.reviewCount ?? driverFresh?.totalReviews ?? 0;
    res.status(201).json({
      message: 'Review submitted',
      data: {
        _id: review._id,
        orderId: review.orderId,
        customerId: review.customerId,
        driverId: review.driverId,
        rating: review.rating,
        comment: review.comment,
        createdAt: review.createdAt,
      },
      driver: {
        averageRating: driverFresh?.averageRating ?? null,
        reviewCount: rc,
        totalReviews: rc,
      },
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ message: 'This order has already been reviewed' });
    }
    next(err);
  }
}

module.exports = {
  createReview,
  recalculateDriverStats,
};
