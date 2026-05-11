const express = require('express');
const router = express.Router();
const auth = require('../middleware/authMiddleware');
const {
    getMonthlyReport,
    sendMonthlyReport,
    autoMonthlyReport,
    exportMonthlyReport
} = require('../controllers/reportController');

router.use(auth);
router.get('/monthly', getMonthlyReport);
router.get('/monthly/export', exportMonthlyReport);
router.post('/monthly/send', sendMonthlyReport);
router.post('/monthly/auto', autoMonthlyReport);

module.exports = router;
