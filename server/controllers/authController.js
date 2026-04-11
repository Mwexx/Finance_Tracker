// controllers/authController.js
const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const sendEmail = require('../utils/sendEmail');

const MAX_NAME_LENGTH = 80;
const MAX_EMAIL_LENGTH = 254;
const MAX_PASSWORD_LENGTH = 128;
const RESET_TOKEN_BYTES = 32;
const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;

function normalizeText(value, maxLength) {
    if (value === undefined || value === null) return '';
    return String(value)
        .replace(/[\u0000-\u001F\u007F]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, maxLength);
}

function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function getPasswordValidationError(password) {
    if (password.length < 8) {
        return 'Password must be at least 8 characters';
    }
    if (password.length > MAX_PASSWORD_LENGTH) {
        return 'Password is too long';
    }
    if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password)) {
        return 'Password must include uppercase, lowercase, and a number';
    }
    return null;
}

function getSafeBaseUrl(req) {
    const configuredBaseUrl = String(process.env.APP_BASE_URL || '').trim();
    if (/^https?:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(configuredBaseUrl)) {
        return configuredBaseUrl.replace(/\/+$/, '');
    }

    const host = String(req.get('host') || '').trim();
    if (!/^[a-z0-9.-]+(?::\d+)?$/i.test(host)) {
        return null;
    }

    const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
    const protocol = forwardedProto === 'http' ? 'http' : 'https';
    return `${protocol}://${host}`;
}

function passwordResetResponse(res) {
    return res.json({
        msg: 'If an account with that email exists, a password reset link has been sent.'
    });
}

// Register User
exports.register = async (req, res) => {
    const name = normalizeText(req.body.name, MAX_NAME_LENGTH);
    const email = normalizeText(req.body.email, MAX_EMAIL_LENGTH).toLowerCase();
    const password = String(req.body.password || '');

    if (!name || !email || !password) {
        return res.status(400).json({ msg: 'Name, email, and password are required' });
    }
    if (!isValidEmail(email)) {
        return res.status(400).json({ msg: 'Please provide a valid email address' });
    }
    const passwordValidationError = getPasswordValidationError(password);
    if (passwordValidationError) {
        return res.status(400).json({ msg: passwordValidationError });
    }

    try {
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ msg: 'An account with this email already exists' });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const user = await new User({
            name,
            email,
            password: hashedPassword
        }).save();

        const payload = { user: { id: user.id } };
        jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '24h' }, (err, token) => {
            if (err) {
                console.error('JWT sign error:', err);
                return res.status(500).json({ msg: 'Token generation failed' });
            }
            res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
        });

    } catch (err) {
        console.error('Register error:', err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
};

// Login User
exports.login = async (req, res) => {
    const email = normalizeText(req.body.email, MAX_EMAIL_LENGTH).toLowerCase();
    const password = String(req.body.password || '');

    if (!email || !password) {
        return res.status(400).json({ msg: 'Email and password are required' });
    }
    if (!isValidEmail(email)) {
        return res.status(400).json({ msg: 'Invalid credentials' });
    }
    if (password.length > MAX_PASSWORD_LENGTH) {
        return res.status(400).json({ msg: 'Invalid credentials' });
    }

    try {
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ msg: 'Invalid credentials' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ msg: 'Invalid credentials' });
        }

        const payload = { user: { id: user.id } };
        jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '24h' }, (err, token) => {
            if (err) {
                console.error('JWT sign error:', err);
                return res.status(500).json({ msg: 'Token generation failed' });
            }
            res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
        });

    } catch (err) {
        console.error('Login error:', err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
};

// Request password reset link
exports.forgotPassword = async (req, res) => {
    const email = normalizeText(req.body.email, MAX_EMAIL_LENGTH).toLowerCase();

    if (!email || !isValidEmail(email)) {
        return passwordResetResponse(res);
    }

    try {
        const user = await User.findOne({ email });
        if (!user) {
            return passwordResetResponse(res);
        }

        const token = crypto.randomBytes(RESET_TOKEN_BYTES).toString('hex');
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        user.passwordResetToken = tokenHash;
        user.passwordResetExpires = new Date(Date.now() + RESET_TOKEN_TTL_MS);
        await user.save();

        const baseUrl = getSafeBaseUrl(req);
        if (!baseUrl) {
            console.error('Password reset email skipped: unable to determine base URL');
            return passwordResetResponse(res);
        }

        const resetUrl = `${baseUrl}/?mode=reset&token=${encodeURIComponent(token)}`;
        const message = `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:10px;">
                <h2 style="color:#1e293b;margin-bottom:8px;">Reset Your Password</h2>
                <p style="color:#475569;">Hi <strong>${user.name}</strong>,</p>
                <p style="color:#1e293b;">We received a request to reset your password for your Personal Finance Tracker account.</p>
                <p style="margin:24px 0;">
                    <a href="${resetUrl}" style="background:#2563eb;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:6px;display:inline-block;">Reset Password</a>
                </p>
                <p style="color:#64748b;font-size:14px;">This link expires in 30 minutes. If you did not request this, you can safely ignore this email.</p>
            </div>
        `;

        await sendEmail({
            to: user.email,
            subject: 'Reset Your Personal Finance Tracker Password',
            message
        });

        return passwordResetResponse(res);
    } catch (err) {
        console.error('Forgot password error:', err.message);
        return passwordResetResponse(res);
    }
};

// Reset password with token
exports.resetPassword = async (req, res) => {
    const token = normalizeText(req.params.token, 200);
    const password = String(req.body.password || '');
    const confirmPassword = String(req.body.confirmPassword || '');

    if (!token || !/^[a-f0-9]{64}$/i.test(token)) {
        return res.status(400).json({ msg: 'Invalid or expired reset link' });
    }
    if (!password || !confirmPassword) {
        return res.status(400).json({ msg: 'Password and confirm password are required' });
    }
    if (password !== confirmPassword) {
        return res.status(400).json({ msg: 'Passwords do not match' });
    }

    const passwordValidationError = getPasswordValidationError(password);
    if (passwordValidationError) {
        return res.status(400).json({ msg: passwordValidationError });
    }

    try {
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        const user = await User.findOne({
            passwordResetToken: tokenHash,
            passwordResetExpires: { $gt: new Date() }
        });

        if (!user) {
            return res.status(400).json({ msg: 'Invalid or expired reset link' });
        }

        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(password, salt);
        user.passwordResetToken = null;
        user.passwordResetExpires = null;
        user.passwordChangedAt = new Date();
        await user.save();

        return res.json({ msg: 'Password reset successful. You can now sign in.' });
    } catch (err) {
        console.error('Reset password error:', err.message);
        return res.status(500).json({ msg: 'Server Error' });
    }
};