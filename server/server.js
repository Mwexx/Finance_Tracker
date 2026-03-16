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
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const hpp = require('hpp');
const mongoSanitize = require('express-mongo-sanitize');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

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
const FAILED_AUTH_WINDOW_MS = 15 * 60 * 1000;
const FAILED_AUTH_THRESHOLD = 6;
const failedAuthAttempts = new Map();

const suspiciousPayloadPatterns = [
    { name: 'mongo-operator', regex: /\$(where|gt|gte|lt|lte|ne|regex|expr|function)\b/i },
    { name: 'script-tag', regex: /<\s*script\b/i },
    { name: 'javascript-uri', regex: /javascript\s*:/i },
    { name: 'sql-union-select', regex: /union\s+select/i },
    { name: 'sql-tautology', regex: /\bor\b\s+1\s*=\s*1/i },
    { name: 'path-traversal', regex: /\.\.\// }
];

app.disable('x-powered-by');
app.set('trust proxy', 1);
mongoose.set('sanitizeFilter', true);

function getClientIp(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
        return String(forwarded).split(',')[0].trim();
    }
    return req.ip || req.socket?.remoteAddress || 'unknown';
}

function truncateForLog(value, maxLength) {
    return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function safeSerializeForInspection(value) {
    try {
        return JSON.stringify(value || {});
    } catch {
        return '';
    }
}

function logRequestEvent(level, eventName, payload) {
    const record = {
        timestamp: new Date().toISOString(),
        event: eventName,
        ...payload
    };

    const serialized = JSON.stringify(record);
    if (level === 'error') {
        console.error(serialized);
        return;
    }
    if (level === 'warn') {
        console.warn(serialized);
        return;
    }
    console.log(serialized);
}

function logSecurityEvent(eventType, req, details) {
    logRequestEvent('warn', 'security', {
        securityEvent: eventType,
        requestId: req?.requestId || null,
        method: req?.method || null,
        path: req?.originalUrl || null,
        ip: req ? getClientIp(req) : null,
        userAgent: req ? truncateForLog(req.headers['user-agent'], 180) : null,
        details: details || {}
    });
}

function findSuspiciousPattern(req) {
    const candidates = [
        req.originalUrl || '',
        safeSerializeForInspection(req.query),
        safeSerializeForInspection(req.body)
    ];

    for (const pattern of suspiciousPayloadPatterns) {
        if (candidates.some((value) => pattern.regex.test(value))) {
            return pattern.name;
        }
    }
    return null;
}

function trackFailedAuthAttempt(req, statusCode) {
    if (!req.originalUrl.startsWith('/api')) return;

    const ip = getClientIp(req);
    const now = Date.now();
    const current = failedAuthAttempts.get(ip);

    let nextState = current;
    if (!nextState || (now - nextState.firstSeenAt) > FAILED_AUTH_WINDOW_MS) {
        nextState = {
            count: 0,
            firstSeenAt: now,
            lastSeenAt: now,
            lastPath: req.originalUrl
        };
    }

    nextState.count += 1;
    nextState.lastSeenAt = now;
    nextState.lastPath = req.originalUrl;
    failedAuthAttempts.set(ip, nextState);

    if (nextState.count >= FAILED_AUTH_THRESHOLD) {
        logSecurityEvent('repeated_auth_failures', req, {
            count: nextState.count,
            windowMs: FAILED_AUTH_WINDOW_MS,
            statusCode,
            lastPath: nextState.lastPath
        });
    }
}

setInterval(() => {
    const now = Date.now();
    for (const [ip, state] of failedAuthAttempts.entries()) {
        if ((now - state.lastSeenAt) > FAILED_AUTH_WINDOW_MS) {
            failedAuthAttempts.delete(ip);
        }
    }
}, 5 * 60 * 1000).unref();

// ============================================
// 4. CONFIGURE MIDDLEWARE
// ============================================

const allowedOrigins = new Set([
    'http://localhost:5000',
    'http://127.0.0.1:5000',
    'http://localhost:5500',
    'http://127.0.0.1:5500'
]);

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { msg: 'Too many requests. Please try again in a few minutes.' },
    handler: (req, res) => {
        logSecurityEvent('rate_limit_exceeded', req, {
            scope: 'api',
            limit: 300,
            windowMs: 15 * 60 * 1000
        });
        res.status(429).json({ msg: 'Too many requests. Please try again in a few minutes.' });
    }
});

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { msg: 'Too many authentication attempts. Please try again later.' },
    handler: (req, res) => {
        logSecurityEvent('auth_rate_limit_exceeded', req, {
            scope: 'auth',
            limit: 20,
            windowMs: 15 * 60 * 1000
        });
        res.status(429).json({ msg: 'Too many authentication attempts. Please try again later.' });
    }
});

app.use(helmet({
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: {
        useDefaults: true,
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", 'https://cdn.jsdelivr.net'],
            scriptSrcAttr: ["'none'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", 'data:'],
            connectSrc: ["'self'"],
            objectSrc: ["'none'"],
            frameAncestors: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"]
        }
    },
    referrerPolicy: { policy: 'no-referrer' }
}));

// CORS - Allow frontend to communicate with backend
app.use(cors({
    origin: function(origin, callback) {
        if (!origin) return callback(null, true);
        if (allowedOrigins.has(origin) || /\.vercel\.app$/i.test(origin)) {
            return callback(null, true);
        }
        logRequestEvent('warn', 'security', {
            securityEvent: 'blocked_cors_origin',
            origin: truncateForLog(origin, 180)
        });
        return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-auth-token']
}));

app.use(hpp());

// Centralized request logging with per-request correlation IDs.
app.use((req, res, next) => {
    const startedAt = process.hrtime.bigint();
    req.requestId = String(req.headers['x-request-id'] || crypto.randomUUID());
    res.setHeader('x-request-id', req.requestId);

    res.on('finish', () => {
        const elapsedNs = process.hrtime.bigint() - startedAt;
        const durationMs = Number(elapsedNs) / 1e6;
        const level = res.statusCode >= 500 ? 'error' : 'info';

        logRequestEvent(level, 'request', {
            requestId: req.requestId,
            method: req.method,
            path: req.originalUrl,
            statusCode: res.statusCode,
            durationMs: Number(durationMs.toFixed(2)),
            ip: getClientIp(req),
            userAgent: truncateForLog(req.headers['user-agent'], 180)
        });

        if (res.statusCode === 401 || res.statusCode === 403) {
            trackFailedAuthAttempt(req, res.statusCode);
        }
    });

    next();
});

// Body parsing middleware
app.use(express.json({ 
    limit: '10mb',
    strict: true 
}));
app.use(express.urlencoded({ 
    extended: true,
    limit: '10mb' 
}));

app.use((req, res, next) => {
    const suspiciousPattern = findSuspiciousPattern(req);
    if (suspiciousPattern) {
        logSecurityEvent('suspicious_payload_pattern', req, {
            pattern: suspiciousPattern,
            path: req.originalUrl
        });
    }
    next();
});

app.use(mongoSanitize({ replaceWith: '_' }));
app.use('/api', apiLimiter);
app.use('/api/auth', authLimiter);

const frontendRoot = path.resolve(__dirname, '..');
console.log(`Serving frontend files from: ${frontendRoot}`);

function sendFrontendFile(res, fileName) {
    const filePath = path.join(frontendRoot, fileName);

    if (!fs.existsSync(filePath)) {
        return false;
    }

    if (fileName.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-store');
    }

    res.sendFile(filePath);
    return true;
}

app.get(['/index.html', '/dashboard.html', '/main.js', '/style.css'], (req, res) => {
    const fileName = path.basename(req.path);

    if (!sendFrontendFile(res, fileName)) {
        return res.status(404).json({
            error: 'Frontend asset not found',
            message: `Please ensure ${fileName} exists in the project root`
        });
    }
});

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
    if (!sendFrontendFile(res, 'index.html')) {
        res.status(404).json({ 
            error: 'Frontend not found', 
            message: 'Please ensure index.html exists in the project root' 
        });
    }
});

// Dashboard page - Main application
app.get('/dashboard', (req, res) => {
    if (!sendFrontendFile(res, 'dashboard.html')) {
        res.status(404).json({ 
            error: 'Dashboard not found', 
            message: 'Please ensure dashboard.html exists in the project root' 
        });
    }
});

// Catch-all for undefined routes (return frontend for SPA behavior)
app.get('*', (req, res) => {
    if (!req.path.startsWith('/api') && sendFrontendFile(res, 'index.html')) {
        return;
    }

    res.status(404).json({ error: 'Route not found' });
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

