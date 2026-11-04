const mongoose = require('mongoose');

const FeedbackSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    subject: { type: String, required: true, trim: true, maxlength: 120 },
    message: { type: String, required: true, trim: true, maxlength: 2000 },
    status: { type: String, enum: ['new', 'in_progress', 'resolved'], default: 'new', index: true },
    adminNote: { type: String, trim: true, maxlength: 1000, default: '' },
    resolvedAt: { type: Date, default: null }
}, { timestamps: true, collection: 'feedback' });

module.exports = mongoose.model('Feedback', FeedbackSchema);
