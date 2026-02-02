import express from 'express';
import multer from 'multer';
import { FileController } from '../controllers/fileController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = express.Router();

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});

// All routes require authentication
router.use(authMiddleware);

router.post('/upload', upload.single('file'), FileController.uploadFile);
router.get('/:fileId', FileController.getFile);
router.delete('/:fileId', FileController.deleteFile);

export default router;
