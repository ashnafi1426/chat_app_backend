import express from 'express';
import { ContactController } from '../controllers/contactController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = express.Router();

// All routes require authentication
router.use(authMiddleware);

router.get('/', ContactController.getContacts);
router.patch('/:contactId', ContactController.updateContact);
router.delete('/:contactId', ContactController.deleteContact);

router.post('/requests', ContactController.sendContactRequest);
router.get('/requests', ContactController.getContactRequests);
router.post('/requests/:requestId/accept', ContactController.acceptContactRequest);
router.post('/requests/:requestId/reject', ContactController.rejectContactRequest);

router.post('/block', ContactController.blockUser);
router.delete('/block/:userId', ContactController.unblockUser);
router.get('/blocked', ContactController.getBlockedUsers);

export default router;
