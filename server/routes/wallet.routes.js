const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const { getMyWallet, postDriverWithdraw } = require('../controllers/walletController');

const router = express.Router();

router.use(authMiddleware);

router.get('/', getMyWallet);
router.post('/withdraw', postDriverWithdraw);

module.exports = router;
