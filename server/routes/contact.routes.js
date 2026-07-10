const express = require('express');
const { postContactMessage } = require('../controllers/contactController');

const router = express.Router();

/** Public — no auth (marketing website contact form). */
router.post('/', postContactMessage);

module.exports = router;
