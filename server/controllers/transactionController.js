const Transaction = require('../models/Transaction');
const Budget = require('../models/Budget');
const User = require('../models/User');
const sendEmail = require('../utils/sendEmail');
const mongoose = require('mongoose');

function escapeRegex(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeText(value, maxLength) {
    if (value === undefined || value === null) return '';
    return String(value)
        .replace(/[\u0000-\u001F\u007F]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, maxLength);
}

function parseDateOrNull(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

function getMonthKeyFromDate(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function formatMonthLabel(monthKey) {
    return new Date(`${monthKey}-01T00:00:00`).toLocaleString('default', { month: 'long', year: 'numeric' });
}

function buildArchiveFilter(body) {
    const ids = Array.isArray(body.ids) ? body.ids.filter((value) => mongoose.Types.ObjectId.isValid(value)) : [];
    if (ids.length) {
        return { _id: mongoose.trusted({ $in: ids }) };
    }

    const startDate = parseDateOrNull(body.startDate);
    const endDate = parseDateOrNull(body.endDate);
    const month = normalizeText(body.month, 7);

    if (month && /^\d{4}-\d{2}$/.test(month)) {
        const [year, monthNumber] = month.split('-').map((part) => Number(part));
        return {
            date: mongoose.trusted({
                $gte: new Date(year, monthNumber - 1, 1),
                $lte: new Date(year, monthNumber, 0, 23, 59, 59, 999)
            })
        };
    }

    if (startDate || endDate) {
        const range = {};
        if (startDate) range.$gte = startDate;
        if (endDate) {
            endDate.setHours(23, 59, 59, 999);
            range.$lte = endDate;
        }
        return { date: mongoose.trusted(range) };
    }

    return null;
}

function getCurrencySymbol(user) {
    return normalizeText(user?.currencySymbol || 'Ksh', 8) || 'Ksh';
}

// Add Transaction
exports.addTransaction = async (req, res) => {
    const type = normalizeText(req.body.type, 10);
    const category = normalizeText(req.body.category, 60);
    const amount = Number(req.body.amount);
    const description = normalizeText(req.body.description, 240);
    const date = req.body.date;

    if (!type || !category || !amount) {
        return res.status(400).json({ msg: 'Type, category, and amount are required' });
    }
    if (!['income', 'expense'].includes(type)) {
        return res.status(400).json({ msg: 'Type must be income or expense' });
    }
    if (isNaN(amount) || Number(amount) <= 0) {
        return res.status(400).json({ msg: 'Amount must be a positive number' });
    }
    if (amount > 1_000_000_000) {
        return res.status(400).json({ msg: 'Amount is too large' });
    }

    const normalizedDate = date ? new Date(date) : new Date();
    if (Number.isNaN(normalizedDate.getTime())) {
        return res.status(400).json({ msg: 'Invalid date value' });
    }

    try {
        const transaction = await new Transaction({
            userId: req.user.id,
            type,
            category,
            amount,
            description,
            date: normalizedDate
        }).save();

        if (type === 'expense') {
            checkBudgetAlert(req.user.id, category).catch(e => console.error('Budget alert error:', e.message));
        }

        res.json(transaction);
    } catch (err) {
        res.status(500).json({ msg: 'Server Error', error: err.message });
    }
};

// Get Transactions (supports ?type=, ?category=, ?startDate=, ?endDate= filters)
exports.getTransactions = async (req, res) => {
    try {
        const filter = { userId: req.user.id };
        const includeArchived = String(req.query.includeArchived || '').toLowerCase() === 'true';
        const archivedOnly = String(req.query.archivedOnly || '').toLowerCase() === 'true';

        if (archivedOnly) {
            filter.isArchived = true;
        } else if (!includeArchived) {
            filter.isArchived = mongoose.trusted({ $ne: true });
        }

        if (req.query.type && ['income', 'expense'].includes(req.query.type)) {
            filter.type = req.query.type;
        }
        if (req.query.category) {
            const queryCategory = normalizeText(req.query.category, 60);
            filter.category = new RegExp(queryCategory.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        }
        if (req.query.startDate || req.query.endDate) {
            const dateRange = {};
            if (req.query.startDate) {
                const start = new Date(req.query.startDate);
                if (Number.isNaN(start.getTime())) {
                    return res.status(400).json({ msg: 'Invalid start date' });
                }
                dateRange.$gte = start;
            }
            if (req.query.endDate) {
                const end = new Date(req.query.endDate);
                if (Number.isNaN(end.getTime())) {
                    return res.status(400).json({ msg: 'Invalid end date' });
                }
                end.setHours(23, 59, 59, 999);
                dateRange.$lte = end;
            }
            filter.date = mongoose.trusted(dateRange);
        }

        const transactions = await Transaction.find(filter).sort({ date: -1 });
        res.json(transactions);
    } catch (err) {
        res.status(500).json({ msg: 'Server Error' });
    }
};

exports.getTransactionMonths = async (req, res) => {
    try {
        const userId = mongoose.Types.ObjectId.isValid(req.user.id)
            ? new mongoose.Types.ObjectId(req.user.id)
            : req.user.id;

        const months = await Transaction.aggregate([
            { $match: { userId } },
            {
                $project: {
                    monthKey: {
                        $dateToString: { format: '%Y-%m', date: '$date' }
                    }
                }
            },
            { $group: { _id: '$monthKey' } },
            { $sort: { _id: -1 } }
        ]);

        return res.json(months.map((entry) => ({
            value: entry._id,
            label: formatMonthLabel(entry._id)
        })));
    } catch (err) {
        console.error('Transaction months error:', err.message);
        return res.status(500).json({ msg: 'Server Error' });
    }
};

exports.archiveTransactions = async (req, res) => {
    try {
        const archiveFilter = buildArchiveFilter(req.body);
        if (!archiveFilter) {
            return res.status(400).json({ msg: 'Provide ids, a month, or a date range to archive' });
        }

        const archivePeriod = normalizeText(req.body.archivePeriod || req.body.month || '', 20);
        const updateResult = await Transaction.updateMany({
            userId: req.user.id,
            ...archiveFilter
        }, {
            $set: {
                isArchived: true,
                archivedAt: new Date(),
                archivePeriod: archivePeriod || req.body.month || ''
            }
        });

        return res.json({
            msg: 'Transactions archived successfully',
            archivedCount: updateResult.modifiedCount || updateResult.nModified || 0
        });
    } catch (err) {
        console.error('Archive transactions error:', err.message);
        return res.status(500).json({ msg: 'Server Error' });
    }
};

exports.unarchiveTransactions = async (req, res) => {
    try {
        const archiveFilter = buildArchiveFilter(req.body);
        if (!archiveFilter) {
            return res.status(400).json({ msg: 'Provide ids, a month, or a date range to unarchive' });
        }

        const updateResult = await Transaction.updateMany({
            userId: req.user.id,
            isArchived: true,
            ...archiveFilter
        }, {
            $set: {
                isArchived: false,
                archivedAt: null,
                archivePeriod: ''
            }
        });

        return res.json({
            msg: 'Transactions restored successfully',
            unarchivedCount: updateResult.modifiedCount || updateResult.nModified || 0
        });
    } catch (err) {
        console.error('Unarchive transactions error:', err.message);
        return res.status(500).json({ msg: 'Server Error' });
    }
};

// Update Transaction
exports.updateTransaction = async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ msg: 'Invalid transaction id' });
        }

        const transaction = await Transaction.findById(req.params.id);
        if (!transaction) return res.status(404).json({ msg: 'Transaction not found' });
        if (transaction.userId.toString() !== req.user.id) {
            return res.status(403).json({ msg: 'Not authorized' });
        }

        const { type, category, amount, date, description } = req.body;
        if (type && ['income', 'expense'].includes(type)) transaction.type = type;
        if (category) transaction.category = normalizeText(category, 60);
        if (amount !== undefined) {
            const normalizedAmount = Number(amount);
            if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0 || normalizedAmount > 1_000_000_000) {
                return res.status(400).json({ msg: 'Amount must be a positive number within range' });
            }
            transaction.amount = normalizedAmount;
        }
        if (date) {
            const normalizedDate = new Date(date);
            if (Number.isNaN(normalizedDate.getTime())) {
                return res.status(400).json({ msg: 'Invalid date value' });
            }
            transaction.date = normalizedDate;
        }
        if (description !== undefined) transaction.description = normalizeText(description, 240);

        await transaction.save();

        if (transaction.type === 'expense') {
            checkBudgetAlert(req.user.id, transaction.category).catch(e => console.error('Budget alert error:', e.message));
        }

        res.json(transaction);
    } catch (err) {
        res.status(500).json({ msg: 'Server Error', error: err.message });
    }
};

// Delete Transaction (with ownership check)
exports.deleteTransaction = async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ msg: 'Invalid transaction id' });
        }
        const transaction = await Transaction.findById(req.params.id);
        if (!transaction) return res.status(404).json({ msg: 'Transaction not found' });
        if (transaction.userId.toString() !== req.user.id) {
            return res.status(403).json({ msg: 'Not authorized' });
        }
        await Transaction.findByIdAndDelete(req.params.id);
        res.json({ msg: 'Transaction removed' });
    } catch (err) {
        res.status(500).json({ msg: 'Server Error' });
    }
};

exports.getArchivedTransactions = async (req, res) => {
    try {
        const archivedTransactions = await Transaction.find({
            userId: req.user.id,
            isArchived: true
        }).sort({ date: -1 });

        return res.json(archivedTransactions);
    } catch (err) {
        console.error('Get archived transactions error:', err.message);
        return res.status(500).json({ msg: 'Server Error' });
    }
};

// Budget Alert Algorithm (80% threshold, one alert per calendar month per category)
async function checkBudgetAlert(userId, category) {
    try {
        const safeCategory = normalizeText(category, 60);
        const categoryMatcher = new RegExp(`^${escapeRegex(safeCategory)}$`, 'i');
        const budget = await Budget.findOne({ userId, category: categoryMatcher }).sort({ updatedAt: -1 });
        if (!budget) return;

        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const monthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

        const transactions = await Transaction.find({
            userId,
            type: 'expense',
            category: categoryMatcher,
            isArchived: mongoose.trusted({ $ne: true }),
            date: mongoose.trusted({ $gte: monthStart, $lte: monthEnd })
        });
        const totalSpent = transactions.reduce((sum, t) => sum + t.amount, 0);
        const percentage = (totalSpent / budget.limit) * 100;

        if (percentage >= 80) {
            // Prevent duplicate alerts within the same calendar month
            const now = new Date();
            if (budget.alertSentAt) {
                const last = new Date(budget.alertSentAt);
                if (last.getMonth() === now.getMonth() && last.getFullYear() === now.getFullYear()) {
                    return;
                }
            }

            const user = await User.findById(userId);
            if (!user || !user.email) return;
            const remaining = budget.limit - totalSpent;
            const currencySymbol = getCurrencySymbol(user);
            const displayCategory = budget.category || safeCategory;
            const subject = `Budget Alert: 80% Threshold Reached - ${displayCategory}`;
            const message = `
                <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:10px;">
                    <h2 style="color:#dc2626;margin-bottom:8px;">&#9888;&#65039; Budget Alert: 80% Threshold Reached</h2>
                    <p style="color:#475569;margin-bottom:20px;">Dear <strong>${user.name}</strong>,</p>
                    <p style="color:#1e293b;">You have used <strong style="color:#dc2626;">${percentage.toFixed(1)}%</strong> of your budget for the <strong>${displayCategory}</strong> category.</p>
                    <table style="width:100%;border-collapse:collapse;margin:20px 0;">
                        <tr style="background:#f8fafc;">
                            <td style="padding:10px 14px;border:1px solid #e2e8f0;font-weight:600;">Category</td>
                            <td style="padding:10px 14px;border:1px solid #e2e8f0;">${displayCategory}</td>
                        </tr>
                        <tr>
                            <td style="padding:10px 14px;border:1px solid #e2e8f0;font-weight:600;">Budget Limit</td>
                            <td style="padding:10px 14px;border:1px solid #e2e8f0;">${currencySymbol} ${budget.limit.toFixed(2)}</td>
                        </tr>
                        <tr style="background:#f8fafc;">
                            <td style="padding:10px 14px;border:1px solid #e2e8f0;font-weight:600;">Amount Spent</td>
                            <td style="padding:10px 14px;border:1px solid #e2e8f0;color:#dc2626;">${currencySymbol} ${totalSpent.toFixed(2)}</td>
                        </tr>
                        <tr>
                            <td style="padding:10px 14px;border:1px solid #e2e8f0;font-weight:600;">Remaining</td>
                            <td style="padding:10px 14px;border:1px solid #e2e8f0;color:${remaining < 0 ? '#dc2626' : '#16a34a'};">${currencySymbol} ${remaining.toFixed(2)}</td>
                        </tr>
                    </table>
                    <p style="color:#64748b;font-size:14px;">Please review your spending to avoid exceeding your budget limit.</p>
                    <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0;">
                    <p style="color:#94a3b8;font-size:12px;">This is an automated alert from your Personal Finance Tracker.</p>
                </div>
            `;

            await sendEmail({ to: user.email, subject, message });

            budget.alertSentAt = now;
            await budget.save();
            console.log(`Budget alert sent to ${user.email} for category: ${displayCategory}`);
        }
    } catch (error) {
        console.error('Budget alert check failed:', error.message);
    }
}

exports.checkBudgetAlert = checkBudgetAlert;