const Budget = require('../models/Budget');
const mongoose = require('mongoose');

function normalizeText(value, maxLength) {
    if (value === undefined || value === null) return '';
    return String(value)
        .replace(/[\u0000-\u001F\u007F]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, maxLength);
}

// Set or update Budget for a category
exports.setBudget = async (req, res) => {
    const category = normalizeText(req.body.category, 60);
    const limit = Number(req.body.limit);

    if (!category || !limit) {
        return res.status(400).json({ msg: 'Category and limit are required' });
    }
    if (isNaN(limit) || Number(limit) <= 0) {
        return res.status(400).json({ msg: 'Limit must be a positive number' });
    }
    if (limit > 1_000_000_000) {
        return res.status(400).json({ msg: 'Limit is too large' });
    }

    try {
        let budget = await Budget.findOne({ userId: req.user.id, category });

        if (budget) {
            budget.limit = limit;
            // Reset alert when limit is changed so user gets fresh alert
            budget.alertSentAt = null;
            await budget.save();
        } else {
            budget = await new Budget({
                userId: req.user.id,
                category,
                limit
            }).save();
        }
        res.json(budget);
    } catch (err) {
        res.status(500).json({ msg: 'Server Error' });
    }
};

// Get all Budgets for user
exports.getBudgets = async (req, res) => {
    try {
        const budgets = await Budget.find({ userId: req.user.id });
        res.json(budgets);
    } catch (err) {
        res.status(500).json({ msg: 'Server Error' });
    }
};

// Delete a Budget (with ownership check)
exports.deleteBudget = async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ msg: 'Invalid budget id' });
        }
        const budget = await Budget.findById(req.params.id);
        if (!budget) return res.status(404).json({ msg: 'Budget not found' });
        if (budget.userId.toString() !== req.user.id) {
            return res.status(403).json({ msg: 'Not authorized' });
        }
        await Budget.findByIdAndDelete(req.params.id);
        res.json({ msg: 'Budget removed' });
    } catch (err) {
        res.status(500).json({ msg: 'Server Error' });
    }
};