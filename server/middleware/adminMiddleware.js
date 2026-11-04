const mongoose = require('mongoose');
const User = require('../models/User');

function configuredAdminEmails() {
    return String(process.env.ADMIN_EMAILS || '')
        .split(',')
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean);
}

module.exports = async function adminMiddleware(req, res, next) {
    try {
        if (!req.user || !mongoose.Types.ObjectId.isValid(req.user.id)) {
            return res.status(403).json({ msg: 'Admin access required' });
        }

        const user = await User.findById(req.user.id).select('email role accountStatus');
        if (!user || (user.accountStatus && user.accountStatus !== 'active')) {
            return res.status(403).json({ msg: 'Admin access required' });
        }

        const isConfiguredAdmin = configuredAdminEmails().includes(user.email.toLowerCase());
        if (user.role !== 'admin' && !isConfiguredAdmin) {
            return res.status(403).json({ msg: 'Admin access required' });
        }

        req.adminUser = user;
        next();
    } catch (error) {
        console.error('Admin authorization error:', error.message);
        res.status(500).json({ msg: 'Unable to verify admin access' });
    }
};
