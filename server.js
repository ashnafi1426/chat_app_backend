import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from './config/config.js';
import { testConnection } from './config/supabase.js';
import { initializeSocket } from './socket/socketHandler.js';
import { EmailService } from './services/emailService.js';
// Import routes
import authRoutes from './routes/authRoutes.js';
import userRoutes from './routes/userRoutes.js';
import conversationRoutes from './routes/conversationRoutes.js';
import messageRoutes from './routes/messageRoutes.js';
import contactRoutes from './routes/contactRoues.js';
import fileRoutes from './routes/fileRoutes.js';

const app = express();
const httpServer = createServer(app);

// Initialize Socket.IO
const io = new Server(httpServer, {
  cors: {
    origin: config.cors.origin,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Middleware
app.use(helmet());
app.use(cors(config.cors));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  message: 'Too many requests from this IP, please try again later.',
});
app.use('/api/', limiter);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/conversations', conversationRoutes);
app.use('/api/v1/messages', messageRoutes);
app.use('/api/v1/contacts', contactRoutes);
app.use('/api/v1/files', fileRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('[v0] Error:', err.stack);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error',
    ...(config.nodeEnv === 'development' && { stack: err.stack }),
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
  });
});

// Initialize Socket.IO handlers
initializeSocket(io);

// Start server
const PORT = config.port;

const startServer = async () => {
  try {
    // Security: Verify JWT secrets are loaded
    console.log('[SECURITY] JWT Configuration Check:');
    console.log('  - JWT_SECRET loaded:', config.jwt.secret ? '✓ YES' : '✗ MISSING');
    console.log('  - JWT_REFRESH_SECRET loaded:', config.jwt.refreshSecret ? '✓ YES' : '✗ MISSING');
    console.log('  - Access token expiry:', config.jwt.expiresIn);
    console.log('  - Refresh token expiry:', config.jwt.refreshExpiresIn);
    
    if (!config.jwt.secret || !config.jwt.refreshSecret) {
      throw new Error('JWT secrets not configured! Check .env file.');
    }
    
    // Initialize email service
    console.log('[EMAIL] Initializing email service...');
    EmailService.initialize();
    
    // Test database connection
    console.log('Testing database connection...');
    await testConnection();
    
    httpServer.listen(PORT, () => {
      console.log("serveer running on port 5000");
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  httpServer.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
