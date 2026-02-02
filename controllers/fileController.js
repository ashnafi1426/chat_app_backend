import { FileService } from '../services/fileService.js';

export class FileController {
  // Upload file
  static async uploadFile(req, res) {
    try {
      const userId = req.user.userId;
      const file = req.file;
      const conversationId = req.body?.conversationId || null;
      const messageId = req.body?.messageId || null;
      
      console.log('[FileController] Upload request:', {
        userId,
        hasFile: !!file,
        conversationId,
        messageId,
        body: req.body
      });
      
      if (!file) {
        return res.status(400).json({
          success: false,
          message: 'No file provided',
        });
      }
      
      const fileRecord = await FileService.uploadFile(userId, file, conversationId, messageId);
      
      res.status(201).json({
        success: true,
        message: 'File uploaded successfully',
        data: fileRecord,
      });
    } catch (error) {
      console.error('[v0] Upload file error:', error);
      res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }
  
  // Get file
  static async getFile(req, res) {
    try {
      const userId = req.user.userId;
      const { fileId } = req.params;
      
      const file = await FileService.getFile(fileId, userId);
      
      res.status(200).json({
        success: true,
        data: file,
      });
    } catch (error) {
      console.error('[v0] Get file error:', error);
      res.status(403).json({
        success: false,
        message: error.message,
      });
    }
  }
  
  // Get conversation files
  static async getConversationFiles(req, res) {
    try {
      const userId = req.user.userId;
      const { conversationId } = req.params;
      const { type } = req.query;
      
      const files = await FileService.getConversationFiles(conversationId, userId, type);
      
      res.status(200).json({
        success: true,
        data: files,
      });
    } catch (error) {
      console.error('[v0] Get conversation files error:', error);
      res.status(403).json({
        success: false,
        message: error.message,
      });
    }
  }
  
  // Delete file
  static async deleteFile(req, res) {
    try {
      const userId = req.user.userId;
      const { fileId } = req.params;
      
      await FileService.deleteFile(fileId, userId);
      
      res.status(200).json({
        success: true,
        message: 'File deleted successfully',
      });
    } catch (error) {
      console.error('[v0] Delete file error:', error);
      res.status(403).json({
        success: false,
        message: error.message,
      });
    }
  }
  
  // Get user's files
  static async getUserFiles(req, res) {
    try {
      const userId = req.user.userId;
      const { limit } = req.query;
      
      const files = await FileService.getUserFiles(userId, parseInt(limit) || 50);
      
      res.status(200).json({
        success: true,
        data: files,
      });
    } catch (error) {
      console.error('[v0] Get user files error:', error);
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }
}
