const Feedback = require('../models/Feedback');

function clean(value, maxLength) {
    return String(value || '').replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, maxLength);
}

exports.createFeedback = async (req, res) => {
    const subject = clean(req.body.subject, 120);
    const message = clean(req.body.message, 2000);

    if (!subject || !message) {
        return res.status(400).json({ msg: 'Subject and message are required' });
    }

    try {
        const feedback = await Feedback.create({ user: req.user.id, subject, message });
        res.status(201).json({ msg: 'Feedback sent successfully', feedback: { id: feedback.id } });
    } catch (error) {
        console.error('Create feedback error:', error.message);
        res.status(500).json({ msg: 'Unable to send feedback' });
    }
};
