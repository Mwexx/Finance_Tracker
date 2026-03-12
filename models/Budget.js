const mongoose = require('mongoose');

const BudgetSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    category: { type: String, required: true },
    limit: { type: Number, required: true },
    alertSentAt: { type: Date, default: null }
}, { timestamps: true });

module.exports = mongoose.model('Budget', BudgetSchema);