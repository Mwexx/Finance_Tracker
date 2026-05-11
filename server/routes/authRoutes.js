const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { register, login, forgotPassword, resetPassword, getMe, updateMe } = require('../controllers/authController');
const auth = require('../middleware/authMiddleware');

const passwordResetRequestLimiter = rateLimit({
	windowMs: 15 * 60 * 1000,
	max: 5,
	standardHeaders: true,
	legacyHeaders: false,
	message: { msg: 'Too many reset requests. Please try again later.' }
});

const passwordResetAttemptLimiter = rateLimit({
	windowMs: 15 * 60 * 1000,
	max: 10,
	standardHeaders: true,
	legacyHeaders: false,
	message: { msg: 'Too many reset attempts. Please try again later.' }
});

router.post('/register', register);
router.post('/login', login);
router.post('/forgot-password', passwordResetRequestLimiter, forgotPassword);
router.post('/reset-password/:token', passwordResetAttemptLimiter, resetPassword);
router.get('/me', auth, getMe);
router.put('/me', auth, updateMe);

module.exports = router;