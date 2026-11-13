const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const { getMyWallet } = require('../controllers/walletController');

const router = express.Router();

router.use(authMiddleware);

router.get('/', getMyWallet);

module.exports = router;
