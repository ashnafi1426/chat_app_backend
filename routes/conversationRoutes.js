import express from 'express';
import { ConversationController } from '../controllers/conversationController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = express.Router();

router.use(authMiddleware);

router.post('/', ConversationController.createConversation);
router.get('/', ConversationController.getUserConversations);
router.get('/:conversationId', ConversationController.getConversation);
router.post('/:conversationId/participants', ConversationController.addParticipant);
router.delete('/:conversationId/participants/:participantId', ConversationController.removeParticipant);
router.patch('/:conversationId', ConversationController.updateConversation);
router.delete('/:conversationId', ConversationController.deleteConversation);

export default router;
