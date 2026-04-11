// models/User.js
const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    name: { 
        type: String, 
        required: [true, 'Name is required'],
        trim: true,
        minlength: [2, 'Name must be at least 2 characters']
    },
    email: { 
        type: String, 
        required: [true, 'Email is required'],
        unique: true,
        lowercase: true,
        trim: true,
        match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email']
    },
    password: { 
        type: String, 
        required: [true, 'Password is required'],
        minlength: [8, 'Password must be at least 8 characters']
    },
    passwordResetToken: {
        type: String,
        default: null,
        select: false
    },
    passwordResetExpires: {
        type: Date,
        default: null,
        select: false
    },
    passwordChangedAt: {
        type: Date,
        default: null
    }
}, { 
    timestamps: true,
    collection: 'users' // 🔥 Explicitly set collection name
});

UserSchema.index({ passwordResetToken: 1, passwordResetExpires: 1 });

// Create and export the model
const User = mongoose.model('User', UserSchema);

module.exports = User;