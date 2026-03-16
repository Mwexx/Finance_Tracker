const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

module.exports = function (req, res, next) {
    // Get token from header
    const token = String(req.header('x-auth-token') || '').trim();

    // Check if not token
    if (!token) {
        return res.status(401).json({ msg: 'No token, authorization denied' });
    }
    if (token.length > 2048) {
        return res.status(400).json({ msg: 'Invalid token format' });
    }

    // Verify token
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (!decoded || !decoded.user || !decoded.user.id || !mongoose.Types.ObjectId.isValid(decoded.user.id)) {
            return res.status(401).json({ msg: 'Token is not valid' });
        }
        req.user = decoded.user;
        next();
    } catch (err) {
        res.status(401).json({ msg: 'Token is not valid' });
    }
};