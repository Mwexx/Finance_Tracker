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
        minlength: [6, 'Password must be at least 6 characters']
    }
}, { 
    timestamps: true,
    collection: 'users' // 🔥 Explicitly set collection name
});

// Add index for faster queries
UserSchema.index({ email: 1 });

// Create and export the model
const User = mongoose.model('User', UserSchema);

// 🔍 Debug: Log when model is loaded
console.log('✅ User model loaded, collection:', User.collection.collectionName);

module.exports = User;