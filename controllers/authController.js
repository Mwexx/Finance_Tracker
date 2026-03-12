// controllers/authController.js
const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Register User
exports.register = async (req, res) => {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
        return res.status(400).json({ msg: 'Name, email, and password are required' });
    }
    if (password.length < 6) {
        return res.status(400).json({ msg: 'Password must be at least 6 characters' });
    }

    try {
        const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
        if (existingUser) {
            return res.status(400).json({ msg: 'An account with this email already exists' });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const user = await new User({
            name: name.trim(),
            email: email.toLowerCase().trim(),
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
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ msg: 'Email and password are required' });
    }

    try {
        const user = await User.findOne({ email: email.toLowerCase().trim() });
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