const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const { createReview } = require('../controllers/reviewsController');

const router = express.Router();

router.use(authMiddleware);

router.post('/', createReview);

module.exports = router;
