const express = require('express');
const router = express.Router();
const auth = require('../middleware/authMiddleware');
const {
    addTransaction,
    getTransactions,
    getTransactionMonths,
    updateTransaction,
    deleteTransaction,
    archiveTransactions,
    unarchiveTransactions,
    getArchivedTransactions
} = require('../controllers/transactionController');

router.use(auth);
router.post('/', addTransaction);
router.get('/months', getTransactionMonths);
router.get('/', getTransactions);
router.get('/archived', getArchivedTransactions);
router.post('/archive', archiveTransactions);
router.post('/unarchive', unarchiveTransactions);
router.put('/:id', updateTransaction);
router.delete('/:id', deleteTransaction);

module.exports = router;