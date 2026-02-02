import { ConversationService } from '../services/conversationService.js';

export class ConversationController {
  static async createConversation(req, res) {
    try {
      const conversation = await ConversationService.createConversation(
        req.user.userId,
        req.body
      );
      res.status(201).json({ success: true, data: conversation });
    } catch (error) {
      console.error('[ConversationController] Create error:', error);
      res.status(400).json({ success: false, message: error.message });
    }
  }

  static async getConversation(req, res) {
    try {
      const data = await ConversationService.getConversationById(
        req.params.conversationId,
        req.user.userId
      );
      res.json({ success: true, data });
    } catch (error) {
      console.error('[ConversationController] Get error:', error);
      res.status(404).json({ success: false, message: error.message });
    }
  }

  static async getUserConversations(req, res) {
    try {
      const data = await ConversationService.getUserConversations(req.user.userId);
      res.json({ success: true, data });
    } catch (error) {
      console.error('[ConversationController] Get user conversations error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async addParticipant(req, res) {
    try {
      const data = await ConversationService.addParticipant(
        req.params.conversationId,
        req.user.userId,
        req.body.userId,
        req.body.role
      );
      res.json({ success: true, data });
    } catch (error) {
      console.error('[ConversationController] Add participant error:', error);
      res.status(400).json({ success: false, message: error.message });
    }
  }

  static async removeParticipant(req, res) {
    try {
      await ConversationService.removeParticipant(
        req.params.conversationId,
        req.user.userId,
        req.params.participantId
      );
      res.json({ success: true });
    } catch (error) {
      console.error('[ConversationController] Remove participant error:', error);
      res.status(400).json({ success: false, message: error.message });
    }
  }

  static async updateConversation(req, res) {
    try {
      const data = await ConversationService.updateConversation(
        req.params.conversationId,
        req.user.userId,
        req.body
      );
      res.json({ success: true, data });
    } catch (error) {
      console.error('[ConversationController] Update error:', error);
      res.status(400).json({ success: false, message: error.message });
    }
  }

  static async deleteConversation(req, res) {
    try {
      await ConversationService.deleteConversation(
        req.params.conversationId,
        req.user.userId
      );
      res.json({ success: true });
    } catch (error) {
      console.error('[ConversationController] Delete error:', error);
      res.status(400).json({ success: false, message: error.message });
    }
  }
}
