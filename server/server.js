/**
 * Personal Finance Tracker - Main Server File
 * 
 * A full-stack application with automated budget alerts
 * Tech Stack: Node.js, Express, MongoDB, Mongoose
 */

// ============================================
// 1. IMPORT DEPENDENCIES
// ============================================
const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

// ============================================
// 2. LOAD ENVIRONMENT VARIABLES
// ============================================
dotenv.config({ path: path.join(__dirname, '.env') });

// Debug: Log loaded environment variables (remove in production)
console.log('\n[Config] Environment Configuration:');
console.log('   PORT:', process.env.PORT || '5000 (default)');
console.log('   MONGO_URI:', process.env.MONGO_URI ? 'Set' : 'MISSING');
console.log('   JWT_SECRET:', process.env.JWT_SECRET ? 'Set' : 'MISSING');
console.log('   NODE_ENV:', process.env.NODE_ENV || 'development');
console.log('');

// Validate critical environment variables
if (!process.env.MONGO_URI) {
    console.error('WARNING: MONGO_URI is not set');
}
if (!process.env.JWT_SECRET) {
    console.error('WARNING: JWT_SECRET is not set');
}

// ============================================
// 3. INITIALIZE EXPRESS APP
// ============================================
const app = express();
const PORT = process.env.PORT || 5000;

// ============================================
// 4. CONFIGURE MIDDLEWARE
// ============================================

// CORS - Allow frontend to communicate with backend
app.use(cors({
    origin: [
        'http://localhost:5000',
        'http://127.0.0.1:5000',
        'http://localhost:5500',
        'http://127.0.0.1:5500',
        /\.vercel\.app$/
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-auth-token']
}));

// Body parsing middleware
app.use(express.json({ 
    limit: '10mb',
    strict: true 
}));
app.use(express.urlencoded({ 
    extended: true,
    limit: '10mb' 
}));

// Serve static files from 'public' directory
const publicPath = path.join(__dirname, 'public');
console.log(`Serving static files from: ${publicPath}`);

// Verify public folder exists
if (!fs.existsSync(publicPath)) {
    console.warn('Warning: public folder not found at:', publicPath);
    try { fs.mkdirSync(publicPath, { recursive: true }); } catch (e) { /* read-only fs in serverless */ }
}

app.use(express.static(publicPath));

// Request logging middleware (development only)
if (process.env.NODE_ENV === 'development') {
    app.use((req, res, next) => {
        console.log(`[Request] ${new Date().toISOString()} - ${req.method} ${req.path}`);
        next();
    });
}

// ============================================
// 5. IMPORT ROUTES
// ============================================
const authRoutes = require('./routes/authRoutes');
const transactionRoutes = require('./routes/transactionRoutes');
const budgetRoutes = require('./routes/budgetRoutes');

// ============================================
// 6. REGISTER API ROUTES
// ============================================

// Ensure DB is connected before any API request (serverless-safe)
app.use('/api', async (req, res, next) => {
    try {
        const connected = await connectDatabase();
        if (!connected) {
            return res.status(503).json({
                error: 'Database unavailable',
                message: 'Failed to connect to MongoDB. Check Atlas network access and credentials.'
            });
        }
        next();
    } catch (err) {
        res.status(503).json({ error: 'Database unavailable', message: err.message });
    }
});

app.use('/api/auth', authRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/budgets', budgetRoutes);

// API Health Check Endpoint
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        message: 'Personal Finance Tracker API is running',
        timestamp: new Date().toISOString(),
        database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
    });
});

// ============================================
// 7. SERVE FRONTEND PAGES
// ============================================

// Home page - Login/Register
app.get('/', (req, res) => {
    const indexPath = path.join(__dirname, 'public', 'index.html');
    
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.status(404).json({ 
            error: 'Frontend not found', 
            message: 'Please ensure public/index.html exists' 
        });
    }
});

// Dashboard page - Main application
app.get('/dashboard', (req, res) => {
    const dashboardPath = path.join(__dirname, 'public', 'dashboard.html');
    
    if (fs.existsSync(dashboardPath)) {
        res.sendFile(dashboardPath);
    } else {
        res.status(404).json({ 
            error: 'Dashboard not found', 
            message: 'Please ensure public/dashboard.html exists' 
        });
    }
});

// Catch-all for undefined routes (return frontend for SPA behavior)
app.get('*', (req, res) => {
    const indexPath = path.join(__dirname, 'public', 'index.html');
    if (fs.existsSync(indexPath) && !req.path.startsWith('/api')) {
        res.sendFile(indexPath);
    } else {
        res.status(404).json({ error: 'Route not found' });
    }
});

// ============================================
// 8. GLOBAL ERROR HANDLER
// ============================================
app.use((err, req, res, next) => {
    console.error('Unhandled Error:', err.stack);
    
    // Don't leak error details in production
    const isProduction = process.env.NODE_ENV === 'production';
    
    res.status(err.status || 500).json({
        error: {
            message: isProduction ? 'Internal server error' : err.message,
            ...(isProduction ? {} : { stack: err.stack })
        }
    });
});

// ============================================
// 9. DATABASE CONNECTION & SERVER STARTUP
// ============================================

/**
 * Connect to MongoDB with robust configuration
 * @returns {Promise<void>}
 */
async function connectDatabase() {
    // Return immediately if already connected (important for serverless warm invocations)
    const state = mongoose.connection.readyState;
    if (state === 1) return true; // already connected
    if (state === 2) {
        // Currently connecting, wait for it
        await new Promise((resolve, reject) => {
            mongoose.connection.once('connected', resolve);
            mongoose.connection.once('error', reject);
        });
        return true;
    }

    try {
        console.log('Connecting to MongoDB...');
        
        await mongoose.connect(process.env.MONGO_URI, {
            serverSelectionTimeoutMS: 10000,
        });
        
        console.log('MongoDB Connected Successfully');
        
        // Listen for connection events (only register once)
        mongoose.connection.on('error', (err) => {
            console.error('MongoDB Connection Error:', err.message);
        });
        
        mongoose.connection.on('disconnected', () => {
            console.warn('MongoDB Disconnected');
        });
        
        return true;
        
    } catch (err) {
        const errInfo = { name: err.name, code: err.code || null, message: err.message ? err.message.substring(0, 300) : null };
        if (err.reason && err.reason.servers) {
            errInfo.servers = {};
            err.reason.servers.forEach((v, k) => {
                errInfo.servers[k] = v && v.error ? { name: v.error.name, msg: String(v.error.message || '').substring(0, 150) } : 'no-error';
            });
        }
        console.error('MongoDB connect failed:', JSON.stringify(errInfo));
        return false;
    }
}

/**
 * Start the Express server for local development.
 */
function startServer() {
    return new Promise((resolve, reject) => {
        const server = app.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
            console.log(`Frontend: http://localhost:${PORT}`);
            console.log(`API Base: http://localhost:${PORT}/api`);
            console.log(`Health Check: http://localhost:${PORT}/api/health`);
            resolve(server);
        });

        server.on('error', (err) => {
            console.error('Failed to start server:', err.message);

            if (err.code === 'EADDRINUSE') {
                console.error(`Port ${PORT} is already in use.`);
            }

            reject(err);
        });
    });
}

/**
 * Graceful shutdown handler for local runs.
 */
async function gracefulShutdown(signal) {
    console.log(`Received ${signal}. Shutting down...`);

    await new Promise((resolve) => {
        mongoose.connection.close(() => {
            console.log('MongoDB connection closed');
            resolve();
        });
    });

    process.exit(0);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('unhandledRejection', (err) => {
    console.error('Unhandled Promise Rejection:', err);
    gracefulShutdown('UNHANDLED_REJECTION');
});

/**
 * Main application bootstrap for local development.
 */
async function bootstrap() {
    const dbConnected = await connectDatabase();

    if (!dbConnected) {
        console.error('Cannot start application without database connection');
        process.exit(1);
    }

    try {
        await startServer();
    } catch (err) {
        console.error('Failed to start HTTP server');
        process.exit(1);
    }
}

// Start the app only when this file is executed directly.
if (require.main === module) {
    bootstrap();
}

// Export app for Vercel serverless and tests.
module.exports = app;

