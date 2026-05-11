const mongoose = require('mongoose');
const Transaction = require('../models/Transaction');
const Budget = require('../models/Budget');
const User = require('../models/User');
const sendEmail = require('../utils/sendEmail');

function normalizeText(value, maxLength) {
    if (value === undefined || value === null) return '';
    return String(value)
        .replace(/[\u0000-\u001F\u007F]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, maxLength);
}

function formatMonthKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
}

function resolveReportMonth(monthParam) {
    const normalized = normalizeText(monthParam, 7);
    if (normalized && /^\d{4}-\d{2}$/.test(normalized)) {
        return normalized;
    }

    const now = new Date();
    const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return formatMonthKey(previousMonth);
}

function getMonthRange(monthKey) {
    const parts = monthKey.split('-');
    const year = Number(parts[0]);
    const month = Number(parts[1]);
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0, 23, 59, 59, 999);
    return { start, end };
}

function currencyFor(user) {
    return {
        code: normalizeText(user?.currencyCode || 'KES', 8) || 'KES',
        symbol: normalizeText(user?.currencySymbol || 'Ksh', 8) || 'Ksh'
    };
}

function groupByCategory(transactions) {
    const totals = {};
    transactions.forEach((transaction) => {
        const key = normalizeText(transaction.category, 60) || 'Uncategorized';
        totals[key] = (totals[key] || 0) + transaction.amount;
    });
    return Object.entries(totals)
        .sort((left, right) => right[1] - left[1])
        .map(([category, total]) => ({ category, total }));
}

function csvEscape(value) {
    const text = String(value === undefined || value === null ? '' : value);
    if (/[",\n\r]/.test(text)) {
        return '"' + text.replace(/"/g, '""') + '"';
    }
    return text;
}

function buildMonthlyReportCsv(report) {
    const lines = [];
    lines.push(['Monthly Report', report.monthLabel].map(csvEscape).join(','));
    lines.push(['Metric', 'Value'].map(csvEscape).join(','));
    lines.push(['Income', report.currency.symbol + ' ' + report.summary.income.toFixed(2)].map(csvEscape).join(','));
    lines.push(['Expenses', report.currency.symbol + ' ' + report.summary.expense.toFixed(2)].map(csvEscape).join(','));
    lines.push(['Net Balance', report.currency.symbol + ' ' + report.summary.balance.toFixed(2)].map(csvEscape).join(','));
    lines.push(['Transactions', String(report.summary.transactionCount)].map(csvEscape).join(','));
    lines.push('');
    lines.push(['Top Spending Categories'].map(csvEscape).join(','));
    lines.push(['Category', 'Total'].map(csvEscape).join(','));
    report.categoryTotals.forEach((entry) => {
        lines.push([entry.category, report.currency.symbol + ' ' + entry.total.toFixed(2)].map(csvEscape).join(','));
    });
    lines.push('');
    lines.push(['Budget Snapshot'].map(csvEscape).join(','));
    lines.push(['Category', 'Limit', 'Spent', 'Used %'].map(csvEscape).join(','));
    report.budgetSnapshots.forEach((snapshot) => {
        lines.push([
            snapshot.category,
            report.currency.symbol + ' ' + snapshot.limit.toFixed(2),
            report.currency.symbol + ' ' + snapshot.spent.toFixed(2),
            snapshot.percentage.toFixed(1) + '%'
        ].map(csvEscape).join(','));
    });
    return lines.join('\r\n');
}

function escapePdfText(value) {
    return String(value === undefined || value === null ? '' : value)
        .replace(/\\/g, '\\\\')
        .replace(/\(/g, '\\(')
        .replace(/\)/g, '\\)');
}

function buildTextPdfBuffer(lines) {
    const cleanLines = lines.map((line) => escapePdfText(line));
    const contentLines = ['BT', '/F1 11 Tf', '1 0 0 1 50 770 Tm', '14 TL'];
    cleanLines.forEach((line, index) => {
        contentLines.push(`(${line}) Tj`);
        if (index !== cleanLines.length - 1) {
            contentLines.push('T*');
        }
    });
    contentLines.push('ET');

    const contentStream = contentLines.join('\n');
    const objects = [];
    objects.push('<< /Type /Catalog /Pages 2 0 R >>');
    objects.push('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
    objects.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>');
    objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
    objects.push(`<< /Length ${Buffer.byteLength(contentStream, 'utf8')} >>\nstream\n${contentStream}\nendstream`);

    let pdf = '%PDF-1.4\n';
    const offsets = [0];
    objects.forEach((object, index) => {
        offsets.push(Buffer.byteLength(pdf, 'utf8'));
        pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
    });
    const xrefOffset = Buffer.byteLength(pdf, 'utf8');
    pdf += `xref\n0 ${objects.length + 1}\n`;
    pdf += '0000000000 65535 f \n';
    for (let i = 1; i < offsets.length; i += 1) {
        pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
    }
    pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
    return Buffer.from(pdf, 'utf8');
}

async function buildMonthlyReport(userId, monthKey) {
    const { start, end } = getMonthRange(monthKey);
    const [user, transactions, budgets] = await Promise.all([
        User.findById(userId),
        Transaction.find({
            userId,
            date: mongoose.trusted({ $gte: start, $lte: end })
        }).sort({ date: -1 }),
        Budget.find({ userId })
    ]);

    if (!user) {
        throw new Error('User not found');
    }

    const totals = transactions.reduce((accumulator, transaction) => {
        if (transaction.type === 'income') accumulator.income += transaction.amount;
        else accumulator.expense += transaction.amount;
        return accumulator;
    }, { income: 0, expense: 0 });

    const categoryTotals = groupByCategory(transactions.filter((transaction) => transaction.type === 'expense'));
    const budgetSnapshots = budgets.map((budget) => {
        const spent = transactions
            .filter((transaction) => transaction.type === 'expense' && String(transaction.category).toLowerCase() === String(budget.category).toLowerCase())
            .reduce((sum, transaction) => sum + transaction.amount, 0);
        const percentage = budget.limit > 0 ? (spent / budget.limit) * 100 : 0;
        return {
            category: budget.category,
            limit: budget.limit,
            spent,
            percentage
        };
    });

    return {
        monthKey,
        monthLabel: new Date(`${monthKey}-01T00:00:00`).toLocaleString('default', { month: 'long', year: 'numeric' }),
        currency: currencyFor(user),
        summary: {
            income: totals.income,
            expense: totals.expense,
            balance: totals.income - totals.expense,
            transactionCount: transactions.length,
            expenseCount: transactions.filter((transaction) => transaction.type === 'expense').length,
            incomeCount: transactions.filter((transaction) => transaction.type === 'income').length
        },
        categoryTotals,
        budgetSnapshots,
        transactions: transactions.slice(0, 25).map((transaction) => ({
            id: transaction._id,
            type: transaction.type,
            category: transaction.category,
            amount: transaction.amount,
            date: transaction.date,
            description: transaction.description
        }))
    };
}

function renderMonthlyReportEmail(user, report) {
    const currencySymbol = report.currency.symbol;
    const budgetRows = report.budgetSnapshots.length
        ? report.budgetSnapshots.map((snapshot) => `
            <tr>
                <td style="padding:10px 14px;border:1px solid #e2e8f0;">${snapshot.category}</td>
                <td style="padding:10px 14px;border:1px solid #e2e8f0;">${currencySymbol} ${snapshot.limit.toFixed(2)}</td>
                <td style="padding:10px 14px;border:1px solid #e2e8f0;">${currencySymbol} ${snapshot.spent.toFixed(2)}</td>
                <td style="padding:10px 14px;border:1px solid #e2e8f0;">${snapshot.percentage.toFixed(1)}%</td>
            </tr>
        `).join('')
        : '<tr><td colspan="4" style="padding:12px;border:1px solid #e2e8f0;">No budgets were set for this month.</td></tr>';

    const categoryRows = report.categoryTotals.length
        ? report.categoryTotals.map((entry) => `
            <li style="margin-bottom:8px;"><strong>${entry.category}</strong>: ${currencySymbol} ${entry.total.toFixed(2)}</li>
        `).join('')
        : '<li>No spending recorded this month.</li>';

    return `
        <div style="font-family:Arial,sans-serif;max-width:720px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:10px;">
            <h2 style="color:#1e293b;margin-bottom:8px;">Monthly Finance Report - ${report.monthLabel}</h2>
            <p style="color:#475569;margin-bottom:20px;">Dear <strong>${user.name}</strong>, here is your monthly summary.</p>
            <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
                <tr>
                    <td style="padding:10px 14px;border:1px solid #e2e8f0;font-weight:600;">Income</td>
                    <td style="padding:10px 14px;border:1px solid #e2e8f0;">${currencySymbol} ${report.summary.income.toFixed(2)}</td>
                </tr>
                <tr>
                    <td style="padding:10px 14px;border:1px solid #e2e8f0;font-weight:600;">Expenses</td>
                    <td style="padding:10px 14px;border:1px solid #e2e8f0;">${currencySymbol} ${report.summary.expense.toFixed(2)}</td>
                </tr>
                <tr>
                    <td style="padding:10px 14px;border:1px solid #e2e8f0;font-weight:600;">Net Balance</td>
                    <td style="padding:10px 14px;border:1px solid #e2e8f0;">${currencySymbol} ${report.summary.balance.toFixed(2)}</td>
                </tr>
                <tr>
                    <td style="padding:10px 14px;border:1px solid #e2e8f0;font-weight:600;">Transactions</td>
                    <td style="padding:10px 14px;border:1px solid #e2e8f0;">${report.summary.transactionCount}</td>
                </tr>
            </table>
            <h3 style="color:#1e293b;margin:24px 0 12px;">Top Spending Categories</h3>
            <ul style="padding-left:18px;color:#475569;">${categoryRows}</ul>
            <h3 style="color:#1e293b;margin:24px 0 12px;">Budget Snapshot</h3>
            <table style="width:100%;border-collapse:collapse;">
                <thead>
                    <tr style="background:#f8fafc;">
                        <th style="padding:10px 14px;border:1px solid #e2e8f0;text-align:left;">Category</th>
                        <th style="padding:10px 14px;border:1px solid #e2e8f0;text-align:left;">Limit</th>
                        <th style="padding:10px 14px;border:1px solid #e2e8f0;text-align:left;">Spent</th>
                        <th style="padding:10px 14px;border:1px solid #e2e8f0;text-align:left;">Used</th>
                    </tr>
                </thead>
                <tbody>${budgetRows}</tbody>
            </table>
        </div>
    `;
}

exports.getMonthlyReport = async (req, res) => {
    try {
        const monthKey = resolveReportMonth(req.query.month);
        const report = await buildMonthlyReport(req.user.id, monthKey);
        return res.json(report);
    } catch (err) {
        console.error('Monthly report error:', err.message);
        return res.status(500).json({ msg: 'Server Error' });
    }
};

exports.sendMonthlyReport = async (req, res) => {
    try {
        const monthKey = resolveReportMonth(req.query.month || req.body.month);
        const report = await buildMonthlyReport(req.user.id, monthKey);
        const user = await User.findById(req.user.id);

        if (!user) {
            return res.status(404).json({ msg: 'User not found' });
        }

        if (user.email) {
            await sendEmail({
                to: user.email,
                subject: `Monthly Finance Report - ${report.monthLabel}`,
                message: renderMonthlyReportEmail(user, report)
            });
        }

        user.lastMonthlyReportMonth = monthKey;
        user.lastMonthlyReportAt = new Date();
        await user.save();

        return res.json({ msg: 'Monthly report generated successfully', report });
    } catch (err) {
        console.error('Monthly report send error:', err.message);
        return res.status(500).json({ msg: 'Server Error' });
    }
};

exports.autoMonthlyReport = async (req, res) => {
    try {
        const current = new Date();
        const previousMonth = new Date(current.getFullYear(), current.getMonth() - 1, 1);
        const monthKey = formatMonthKey(previousMonth);
        const user = await User.findById(req.user.id);

        if (!user) {
            return res.status(404).json({ msg: 'User not found' });
        }
        if (user.lastMonthlyReportMonth === monthKey) {
            return res.json({ msg: 'Monthly report already generated', skipped: true, monthKey });
        }

        const report = await buildMonthlyReport(req.user.id, monthKey);
        if (user.email) {
            await sendEmail({
                to: user.email,
                subject: `Monthly Finance Report - ${report.monthLabel}`,
                message: renderMonthlyReportEmail(user, report)
            });
        }

        user.lastMonthlyReportMonth = monthKey;
        user.lastMonthlyReportAt = new Date();
        await user.save();

        return res.json({ msg: 'Monthly report generated', skipped: false, monthKey, report });
    } catch (err) {
        console.error('Auto monthly report error:', err.message);
        return res.status(500).json({ msg: 'Server Error' });
    }
};

exports.exportMonthlyReport = async (req, res) => {
    try {
        const monthKey = resolveReportMonth(req.query.month);
        const format = normalizeText(req.query.format || 'csv', 10).toLowerCase();
        const report = await buildMonthlyReport(req.user.id, monthKey);
        const fileBase = `finance-report-${report.monthKey}`;

        if (format === 'pdf') {
            const lines = [
                `Monthly Finance Report - ${report.monthLabel}`,
                `Income: ${report.currency.symbol} ${report.summary.income.toFixed(2)}`,
                `Expenses: ${report.currency.symbol} ${report.summary.expense.toFixed(2)}`,
                `Net Balance: ${report.currency.symbol} ${report.summary.balance.toFixed(2)}`,
                `Transactions: ${report.summary.transactionCount}`,
                '',
                'Top Spending Categories:'
            ];
            report.categoryTotals.forEach((entry) => {
                lines.push(`- ${entry.category}: ${report.currency.symbol} ${entry.total.toFixed(2)}`);
            });
            lines.push('', 'Budget Snapshot:');
            report.budgetSnapshots.forEach((snapshot) => {
                lines.push(`- ${snapshot.category}: limit ${report.currency.symbol} ${snapshot.limit.toFixed(2)}, spent ${report.currency.symbol} ${snapshot.spent.toFixed(2)}, used ${snapshot.percentage.toFixed(1)}%`);
            });

            const pdfBuffer = buildTextPdfBuffer(lines);
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="${fileBase}.pdf"`);
            return res.send(pdfBuffer);
        }

        const csv = buildMonthlyReportCsv(report);
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${fileBase}.csv"`);
        return res.send(csv);
    } catch (err) {
        console.error('Monthly report export error:', err.message);
        return res.status(500).json({ msg: 'Server Error' });
    }
};
