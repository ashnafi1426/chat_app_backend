import { MessageService } from '../services/messageService.js';

export class MessageController {

  // ===============================
  // SEND MESSAGE
  // ===============================
  static async sendMessage(req, res) {
    try {
      const userId = req.user.userId;
      const { conversationId, content, type, replyToId } = req.body;

      if (!conversationId || !content || !content.trim()) {
        return res.status(400).json({
          success: false,
          message: 'Conversation ID and non-empty content are required',
        });
      }

      const message = await MessageService.sendMessage(userId, {
        conversationId,
        content: content.trim(),
        type,
        replyToId,
      });

      res.status(201).json({
        success: true,
        data: message,
      });
    } catch (error) {
      console.error('[MessageController] sendMessage:', error);
      res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }

  // ===============================
  // GET MESSAGES
  // ===============================
  static async getMessages(req, res) {
    try {
      const userId = req.user.userId;
      const { conversationId } = req.params;
      const limit = Number(req.query.limit) || 50;
      const before = req.query.before || null;

      const messages = await MessageService.getMessages(
        conversationId,
        userId,
        limit,
        before
      );

      res.json({
        success: true,
        data: messages,
      });
    } catch (error) {
      console.error('[MessageController] getMessages:', error);

      const status =
        error.message.includes('participant') ? 403 :
        error.message.includes('not found') ? 404 :
        500;

      res.status(status).json({
        success: false,
        message: error.message,
      });
    }
  }

  // ===============================
  // EDIT MESSAGE
  // ===============================
  static async editMessage(req, res) {
    try {
      const userId = req.user.userId;
      const { messageId } = req.params;
      const { content } = req.body;

      if (!content || !content.trim()) {
        return res.status(400).json({
          success: false,
          message: 'Content is required',
        });
      }

      const message = await MessageService.editMessage(
        messageId,
        userId,
        content.trim()
      );

      res.json({
        success: true,
        data: message,
      });
    } catch (error) {
      console.error('[MessageController] editMessage:', error);
      res.status(403).json({
        success: false,
        message: error.message,
      });
    }
  }

  // ===============================
  // DELETE MESSAGE
  // ===============================
  static async deleteMessage(req, res) {
    try {
      const userId = req.user.userId;
      const { messageId } = req.params;

      await MessageService.deleteMessage(messageId, userId);

      res.json({ success: true });
    } catch (error) {
      console.error('[MessageController] deleteMessage:', error);
      res.status(403).json({
        success: false,
        message: error.message,
      });
    }
  }

  // ===============================
  // ADD / REMOVE REACTION
  // ===============================
  static async addReaction(req, res) {
    try {
      const userId = req.user.userId;
      const { messageId } = req.params;
      const { reaction } = req.body;

      if (!reaction || reaction.length > 5) {
        return res.status(400).json({
          success: false,
          message: 'Invalid reaction',
        });
      }

      const result = await MessageService.addReaction(
        messageId,
        userId,
        reaction
      );

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error('[MessageController] addReaction:', error);
      res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }

  // ===============================
  // MARK AS READ
  // ===============================
  static async markAsRead(req, res) {
    try {
      const userId = req.user.userId;
      const { conversationId } = req.params;

      await MessageService.markAsRead(conversationId, userId);

      res.json({ success: true });
    } catch (error) {
      console.error('[MessageController] markAsRead:', error);
      res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }

  // ===============================
  // SEARCH MESSAGES (SECURE)
  // ===============================
  static async searchMessages(req, res) {
    try {
      const userId = req.user.userId;
      const { q, conversationId } = req.query;

      if (!q || !q.trim()) {
        return res.status(400).json({
          success: false,
          message: 'Search query is required',
        });
      }

      const messages = await MessageService.searchMessages(
        userId,
        q.trim(),
        conversationId
      );

      res.json({
        success: true,
        data: messages,
      });
    } catch (error) {
      console.error('[MessageController] searchMessages:', error);
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }

  // ===============================
  // READ RECEIPTS - MARK MESSAGES AS READ
  // ===============================
  static async markMessagesAsRead(req, res) {
    try {
      const userId = req.user.userId;
      const { messageIds } = req.body;

      if (!messageIds || !Array.isArray(messageIds) || messageIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'messageIds array is required',
        });
      }

      const result = await MessageService.markMessagesAsRead(userId, messageIds);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error('[MessageController] markMessagesAsRead:', error);
      
      const status =
        error.message.includes('Unauthorized') || error.message.includes('Cannot mark own') ? 403 :
        error.message.includes('not found') ? 404 :
        error.message.includes('No message IDs') ? 400 :
        500;

      res.status(status).json({
        success: false,
        message: error.message,
      });
    }
  }

  // ===============================
  // READ RECEIPTS - GET MESSAGE STATUS
  // ===============================
  static async getMessageStatus(req, res) {
    try {
      const userId = req.user.userId;
      const { messageId } = req.params;

      const statuses = await MessageService.getMessageStatus([messageId], userId);

      // Aggregate status for the message
      const overallStatus = await MessageService.aggregateGroupStatus(messageId);

      res.json({
        success: true,
        data: {
          message_id: messageId,
          overall_status: overallStatus,
          recipients: statuses,
        },
      });
    } catch (error) {
      console.error('[MessageController] getMessageStatus:', error);
      
      const status =
        error.message.includes('Unauthorized') ? 403 :
        error.message.includes('not found') ? 404 :
        500;

      res.status(status).json({
        success: false,
        message: error.message,
      });
    }
  }
}
