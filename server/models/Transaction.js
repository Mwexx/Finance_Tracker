const mongoose = require('mongoose');

const TransactionSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['income', 'expense'], required: true },
    category: { type: String, required: true },
    amount: { type: Number, required: true },
    description: { type: String, default: '' },
    date: { type: Date, default: Date.now },
    isArchived: { type: Boolean, default: false },
    archivedAt: { type: Date, default: null },
    archivePeriod: { type: String, default: '' }
}, { timestamps: true });

module.exports = mongoose.model('Transaction', TransactionSchema);
