const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const {
  sendMessage,
  getUnreadCounts,
  getChatByOrderId,
  markMessagesRead,
} = require('../controllers/chatController');

const router = express.Router();

router.get('/', (req, res) =>
  res.json({
    chat: 'mounted',
    endpoints: ['GET /unread-counts', 'POST /send', 'PATCH /mark-read/:orderId', 'GET /:orderId'],
  })
);

router.use(authMiddleware);

router.get('/unread-counts', getUnreadCounts);
router.post('/send', sendMessage);
router.patch('/mark-read/:orderId', markMessagesRead);
router.get('/:orderId', getChatByOrderId);

module.exports = router;
