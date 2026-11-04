const express = require('express');
const rateLimit = require('express-rate-limit');
const auth = require('../middleware/authMiddleware');
const admin = require('../middleware/adminMiddleware');
const controller = require('../controllers/adminController');

const router = express.Router();
const broadcastLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 3,
    standardHeaders: true,
    legacyHeaders: false,
    message: { msg: 'Broadcast limit reached. Please try again later.' }
});

router.use(auth, admin);
router.get('/summary', controller.summary);
router.get('/users', controller.listUsers);
router.patch('/users/:id', controller.updateUser);
router.get('/feedback', controller.listFeedback);
router.patch('/feedback/:id', controller.updateFeedback);
router.post('/broadcast/preview', controller.previewBroadcast);
router.post('/broadcast/send', broadcastLimiter, controller.sendBroadcast);

module.exports = router;
