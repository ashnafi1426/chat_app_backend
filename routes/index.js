import { Router } from 'express';
import { 
  login, 
  register, 
  me, 
  updateProfile, 
  logout, 
  refreshToken, 
  validateToken,
  authenticateToken 
} from '../controllers/auth.controller.js';

const router = Router();

// Public routes (no authentication required)
router.post('/auth/register', register);
router.post('/auth/login', login);

// Protected routes (authentication required)
router.get('/auth/me', authenticateToken, me);
router.put('/auth/profile', authenticateToken, updateProfile);
router.post('/auth/logout', authenticateToken, logout);
router.post('/auth/refresh', authenticateToken, refreshToken);
router.get('/auth/validate', authenticateToken, validateToken);

// Health check
router.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'ChatSphere API is running',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

export default router;
