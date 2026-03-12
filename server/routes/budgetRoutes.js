const express = require('express');
const router = express.Router();
const auth = require('../middleware/authMiddleware');
const { setBudget, getBudgets, deleteBudget } = require('../controllers/budgetController');

router.use(auth);
router.post('/', setBudget);
router.get('/', getBudgets);
router.delete('/:id', deleteBudget);

module.exports = router;