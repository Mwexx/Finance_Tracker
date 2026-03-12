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
console.log('\n🔧 Environment Configuration:');
console.log('   PORT:', process.env.PORT || '5000 (default)');
console.log('   MONGO_URI:', process.env.MONGO_URI ? '✓ Set' : '✗ MISSING');
console.log('   JWT_SECRET:', process.env.JWT_SECRET ? '✓ Set' : '✗ MISSING');
console.log('   NODE_ENV:', process.env.NODE_ENV || 'development');
console.log('');

// Validate critical environment variables
if (!process.env.MONGO_URI) {
    console.error('❌ WARNING: MONGO_URI is not set');
}
if (!process.env.JWT_SECRET) {
    console.error('❌ WARNING: JWT_SECRET is not set');
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
console.log(`📁 Serving static files from: ${publicPath}`);

// Verify public folder exists
if (!fs.existsSync(publicPath)) {
    console.warn('⚠️  Warning: public folder not found at:', publicPath);
    try { fs.mkdirSync(publicPath, { recursive: true }); } catch (e) { /* read-only fs in serverless */ }
}

app.use(express.static(publicPath));

// Request logging middleware (development only)
if (process.env.NODE_ENV === 'development') {
    app.use((req, res, next) => {
        console.log(`📡 ${new Date().toISOString()} - ${req.method} ${req.path}`);
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
        await connectDatabase();
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
    console.error('❌ Unhandled Error:', err.stack);
    
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
        // Currently connecting — wait for it
        await new Promise((resolve, reject) => {
            mongoose.connection.once('connected', resolve);
            mongoose.connection.once('error', reject);
        });
        return true;
    }

    try {
        console.log('🔌 Connecting to MongoDB...');
        
        await mongoose.connect(process.env.MONGO_URI, {
            serverSelectionTimeoutMS: 10000,
        });
        
        console.log('✅ MongoDB Connected Successfully');
        
        // Listen for connection events (only register once)
        mongoose.connection.on('error', (err) => {
            console.error('❌ MongoDB Connection Error:', err.message);
        });
        
        mongoose.connection.on('disconnected', () => {
            console.warn('⚠️  MongoDB Disconnected');
        });
        
        return true;
        
    } catch (err) {
        console.error('❌ Failed to connect to MongoDB:');
        console.error('   Error Name:', err.name);
        console.error('   Error Message:', err.message);
        console.error('   Error Code:', err.code);
        
        // Provide helpful troubleshooting tips
        if (err.code === 'ECONNREFUSED') {
            console.error('\n💡 Troubleshooting Tips:');
            console.error('   1. Ensure MongoDB is running: "net start MongoDB" (Windows)');
            console.error('   2. Check if port 27017 is in use: "netstat -ano | findstr :27017"');
            console.error('   3. Verify MONGO_URI in .env file');
            console.error('   4. Try using "localhost" instead of "127.0.0.1" or vice versa');
        }
        
        if (err.name === 'MongoServerSelectionError') {
            console.error('\n💡 This usually means:');
            console.error('   - MongoDB service is not running');
            console.error('   - Wrong connection string in .env');
            console.error('   - Firewall blocking connection');
        }
        
        return false;
    }
}

/**
 * Start the Express server
 */
function startServer() {
    return new Promise((resolve, reject) => {
        const server = app.listen(PORT, () => {
            console.log(`\n🚀 Server running on port ${PORT}`);
            console.log(`📱 Frontend: http://localhost:${PORT}`);
            console.log(`🔗 API Base: http://localhost:${PORT}/api`);
            console.log(`🏥 Health Check: http://localhost:${PORT}/api/health\n`);
            resolve(server);
        });
        
        server.on('error', (err) => {
            console.error('❌ Failed to start server:', err.message);
            
            if (err.code === 'EADDRINUSE') {
                console.error(`\n💡 Port ${PORT} is already in use.`);
                console.error('   Try one of these:');
                console.error(`   1. Kill the process: netstat -ano | findstr :${PORT} → taskkill /PID <PID> /F`);
                console.error(`   2. Use a different port: Change PORT in .env file`);
            }
            
            reject(err);
        });
    });
}

/**
 * Graceful shutdown handler
 */
async function gracefulShutdown(signal) {
    console.log(`\n🛑 Received ${signal}. Shutting down gracefully...`);
    
    // Close HTTP server
    await new Promise((resolve) => {
        mongoose.connection.close(() => {
            console.log('✅ MongoDB connection closed');
            resolve();
        });
    });
    
    console.log('✅ Shutdown complete');
    process.exit(0);
}

// Handle shutdown signals
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
    console.error('❌ Unhandled Promise Rejection:', err);
    gracefulShutdown('UNHANDLED_REJECTION');
});

// ============================================
// 10. APPLICATION INITIALIZATION
// ============================================

/**
 * Main application bootstrap function
 */
async function bootstrap() {
    console.log('\n' + '='.repeat(50));
    console.log('🏦 Personal Finance Tracker - Starting Up');
    console.log('='.repeat(50) + '\n');
    
    // Step 1: Connect to database
    const dbConnected = await connectDatabase();
    
    if (!dbConnected) {
        console.error('\n❌ Cannot start application without database connection');
        console.error('   Fix the MongoDB connection issue and restart the server');
        process.exit(1);
    }
    
    // Step 2: Start HTTP server
    try {
        await startServer();
        console.log('✅ Application started successfully!\n');
    } catch (err) {
        console.error('\n❌ Failed to start HTTP server');
        process.exit(1);
    }
}

// Start the application when run directly (local dev)
// In Vercel/serverless, the exported app is used instead
if (require.main === module) {
    bootstrap();
}

// Export app for Vercel serverless and testing
module.exports = app;