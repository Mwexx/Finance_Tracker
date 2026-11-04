const mongoose = require('mongoose');
const User = require('../models/User');
const Feedback = require('../models/Feedback');
const sendEmail = require('../utils/sendEmail');

const MAX_BROADCAST_RECIPIENTS = 500;
const MAX_CONCURRENT_EMAILS = 3;

function clean(value, maxLength) {
    return String(value || '').replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, maxLength);
}

function escapeHtml(value) {
    return clean(value, 2000)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function broadcastPayload(body) {
    const subject = clean(body.subject, 140);
    const message = String(body.message || '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, 10000);
    if (!subject || !message) {
        const error = new Error('Subject and message are required');
        error.status = 400;
        throw error;
    }
    return { subject, message };
}

async function getRecipients() {
    const users = await User.find({})
        .select('_id email name')
        .sort({ _id: 1 })
        .lean();

    return users
        .filter((user) => (!user.accountStatus || user.accountStatus === 'active')
            && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(user.email || '').trim()))
        .slice(0, MAX_BROADCAST_RECIPIENTS);
}

exports.summary = async (req, res) => {
    try {
        const [users, userStatuses, newFeedback, totalFeedback] = await Promise.all([
            User.countDocuments(),
            User.find({}).select('accountStatus').lean(),
            Feedback.countDocuments({ status: 'new' }),
            Feedback.countDocuments()
        ]);
        const activeUsers = userStatuses.filter((user) => !user.accountStatus || user.accountStatus === 'active').length;
        res.json({ users, activeUsers, newFeedback, totalFeedback });
    } catch (error) {
        console.error('Admin summary error:', error.message);
        res.status(500).json({ msg: 'Unable to load admin summary' });
    }
};

exports.listUsers = async (req, res) => {
    try {
        const search = clean(req.query.search, 120);
        const query = search ? {
            $or: [
                { name: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } }
            ]
        } : {};
        const users = await User.find(query)
            .select('name email role accountStatus country createdAt lastMonthlyReportAt')
            .sort({ createdAt: -1 })
            .limit(200)
            .lean();
        res.json({ users: users.map((user) => ({
            ...user,
            role: user.role || 'user',
            accountStatus: user.accountStatus || 'active'
        })) });
    } catch (error) {
        console.error('Admin users error:', error.message);
        res.status(500).json({ msg: 'Unable to load users' });
    }
};

exports.updateUser = async (req, res) => {
    const userId = String(req.params.id || '');
    if (!mongoose.Types.ObjectId.isValid(userId)) {
        return res.status(400).json({ msg: 'Invalid user id' });
    }
    if (userId === String(req.adminUser._id)) {
        return res.status(400).json({ msg: 'Your own admin account cannot be changed here' });
    }

    const updates = {};
    if (req.body.accountStatus === 'active' || req.body.accountStatus === 'suspended') {
        updates.accountStatus = req.body.accountStatus;
    }
    if (req.body.role === 'user' || req.body.role === 'admin') {
        updates.role = req.body.role;
    }
    if (!Object.keys(updates).length) {
        return res.status(400).json({ msg: 'No valid account changes supplied' });
    }

    try {
        const user = await User.findByIdAndUpdate(userId, updates, { new: true })
            .select('name email role accountStatus');
        if (!user) return res.status(404).json({ msg: 'User not found' });
        res.json({ user });
    } catch (error) {
        console.error('Admin user update error:', error.message);
        res.status(500).json({ msg: 'Unable to update user' });
    }
};

exports.listFeedback = async (req, res) => {
    try {
        const feedback = await Feedback.find({})
            .populate('user', 'name email')
            .sort({ createdAt: -1 })
            .limit(200)
            .lean();
        res.json({ feedback });
    } catch (error) {
        console.error('Admin feedback error:', error.message);
        res.status(500).json({ msg: 'Unable to load feedback' });
    }
};

exports.updateFeedback = async (req, res) => {
    const status = ['new', 'in_progress', 'resolved'].includes(req.body.status) ? req.body.status : null;
    if (!status) return res.status(400).json({ msg: 'Invalid feedback status' });
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ msg: 'Invalid feedback id' });

    try {
        const feedback = await Feedback.findByIdAndUpdate(req.params.id, {
            status,
            adminNote: clean(req.body.adminNote, 1000),
            resolvedAt: status === 'resolved' ? new Date() : null
        }, { new: true }).populate('user', 'name email');
        if (!feedback) return res.status(404).json({ msg: 'Feedback not found' });
        res.json({ feedback });
    } catch (error) {
        console.error('Admin feedback update error:', error.message);
        res.status(500).json({ msg: 'Unable to update feedback' });
    }
};

exports.previewBroadcast = async (req, res) => {
    try {
        const { subject, message } = broadcastPayload(req.body);
        const recipients = await getRecipients();
        res.json({
            recipientCount: recipients.length,
            capped: recipients.length === MAX_BROADCAST_RECIPIENTS,
            subject,
            messagePreview: message.slice(0, 240)
        });
    } catch (error) {
        res.status(error.status || 500).json({ msg: error.message || 'Unable to preview email' });
    }
};

exports.sendBroadcast = async (req, res) => {
    try {
        if (req.body.confirmation !== 'SEND') {
            return res.status(400).json({ msg: 'Type SEND to confirm this broadcast' });
        }
        const { subject, message } = broadcastPayload(req.body);
        const recipients = await getRecipients();
        const html = `<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;padding:24px;color:#1e293b;">${escapeHtml(message).replace(/\n/g, '<br>')}</div>`;
        let sent = 0;
        let failed = 0;
        let cursor = 0;

        async function worker() {
            while (cursor < recipients.length) {
                const recipient = recipients[cursor++];
                try {
                    await sendEmail({ to: recipient.email, subject, message: html });
                    sent += 1;
                } catch (error) {
                    failed += 1;
                    console.error(`Admin broadcast failed for ${recipient.email}:`, error.message);
                }
            }
        }

        await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENT_EMAILS, recipients.length) }, worker));
        res.json({ msg: 'Broadcast completed', total: recipients.length, sent, failed });
    } catch (error) {
        res.status(error.status || 500).json({ msg: error.message || 'Unable to send broadcast' });
    }
};
