import express from 'express';
import { MessageController } from '../controllers/messageController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = express.Router();

router.use(authMiddleware);

router.post('/', MessageController.sendMessage);
router.get('/search', MessageController.searchMessages);
router.get('/:conversationId', MessageController.getMessages);
router.patch('/:messageId', MessageController.editMessage);
router.delete('/:messageId', MessageController.deleteMessage);
router.post('/:messageId/reactions', MessageController.addReaction);
router.post('/:conversationId/read', MessageController.markAsRead);

// Read receipts endpoints
router.post('/mark-read', MessageController.markMessagesAsRead);
router.get('/:messageId/status', MessageController.getMessageStatus);

export default router;
