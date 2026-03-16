// controllers/authController.js
const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const MAX_NAME_LENGTH = 80;
const MAX_EMAIL_LENGTH = 254;
const MAX_PASSWORD_LENGTH = 128;

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
    if (password.length < 6) {
        return res.status(400).json({ msg: 'Password must be at least 6 characters' });
    }
    if (password.length > MAX_PASSWORD_LENGTH) {
        return res.status(400).json({ msg: 'Password is too long' });
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