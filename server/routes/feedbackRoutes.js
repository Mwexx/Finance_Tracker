const express = require('express');
const rateLimit = require('express-rate-limit');
const auth = require('../middleware/authMiddleware');
const { createFeedback } = require('../controllers/feedbackController');

const router = express.Router();
const feedbackLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { msg: 'Too many feedback submissions. Please try again later.' }
});

router.post('/', auth, feedbackLimiter, createFeedback);

module.exports = router;
