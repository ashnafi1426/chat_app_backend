import jwt from 'jsonwebtoken';
import { config } from '../config/config.js';

export const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.error('[AUTH] Authorization header missing or invalid:', {
      hasHeader: !!authHeader,
      headerValue: authHeader ? authHeader.substring(0, 20) + '...' : 'none',
      timestamp: new Date().toISOString(),
    });
    return res.status(401).json({
      success: false,
      message: 'Authorization token missing',
    });
  }
  
  const token = authHeader.split(' ')[1];
  
  if (!token || token.trim() === '') {
    console.error('[AUTH] Token extraction failed:', {
      authHeader: authHeader.substring(0, 30) + '...',
      tokenLength: token ? token.length : 0,
      timestamp: new Date().toISOString(),
    });
    return res.status(401).json({
      success: false,
      message: 'Authorization token missing',
    });
  }

  try {
    const decoded = jwt.verify(token, config.jwt.secret);

    // 🔐 ENSURE ACCESS TOKEN ONLY (Security Fix: Prevent refresh token misuse)
    if (decoded.type !== 'access') {
      console.error('[AUTH] Token type validation failed:', {
        receivedType: decoded.type,
        expectedType: 'access',
        userId: decoded.userId,
        timestamp: new Date().toISOString(),
      });
      return res.status(401).json({
        success: false,
        message: 'Invalid token type',
      });
    }

    req.user = {
      userId: decoded.userId,
      email: decoded.email,
      username: decoded.username,
    };

    next();
  } catch (err) {
    // Log detailed error for debugging while keeping client message generic
    console.error('[AUTH] Token verification failed:', {
      error: err.message,
      errorName: err.name,
      timestamp: new Date().toISOString(),
      // Don't log the actual token for security
    });
    
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired token',
    });
  }
};
