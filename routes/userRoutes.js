import express from 'express';
import { UserController } from '../controllers/userController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = express.Router();

// All routes require authentication
router.use(authMiddleware);

router.get('/me', UserController.getCurrentUser);
router.get('/search', UserController.searchUsers);
router.get('/conversations', UserController.getConversations);
router.get('/settings', UserController.getSettings);
router.get('/:userId', UserController.getUserById);

router.patch('/profile', UserController.updateProfile);
router.patch('/status', UserController.updateStatus);
router.patch('/settings', UserController.updateSettings);

export default router;
