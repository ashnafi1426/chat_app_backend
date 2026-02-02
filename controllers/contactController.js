import { ContactService } from '../services/contactService.js';

export class ContactController {
  // Send contact request
  static async sendContactRequest(req, res) {
    try {
      const userId = req.user.userId;
      const { userId: contactUserId } = req.body;
      
      if (!contactUserId) {
        return res.status(400).json({
          success: false,
          message: 'Contact user ID is required',
        });
      }
      
      if (userId === contactUserId) {
        return res.status(400).json({
          success: false,
          message: 'Cannot send contact request to yourself',
        });
      }
      
      const request = await ContactService.sendContactRequest(userId, contactUserId);
      
      res.status(201).json({
        success: true,
        message: 'Contact request sent successfully',
        data: request,
      });
    } catch (error) {
      console.error('[v0] Send contact request error:', error);
      res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }
  
  // Get contact requests
  static async getContactRequests(req, res) {
    try {
      const userId = req.user.userId;
      const { type } = req.query;
      
      const requests = await ContactService.getContactRequests(userId, type || 'received');
      
      res.status(200).json({
        success: true,
        data: requests,
      });
    } catch (error) {
      console.error('[v0] Get contact requests error:', error);
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }
  
  // Accept contact request
  static async acceptContactRequest(req, res) {
    try {
      const userId = req.user.userId;
      const { requestId } = req.params;
      
      const contact = await ContactService.acceptContactRequest(userId, requestId);
      
      res.status(200).json({
        success: true,
        message: 'Contact request accepted',
        data: contact,
      });
    } catch (error) {
      console.error('[v0] Accept contact request error:', error);
      res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }
  
  // Reject contact request
  static async rejectContactRequest(req, res) {
    try {
      const userId = req.user.userId;
      const { requestId } = req.params;
      
      await ContactService.rejectContactRequest(userId, requestId);
      
      res.status(200).json({
        success: true,
        message: 'Contact request rejected',
      });
    } catch (error) {
      console.error('[v0] Reject contact request error:', error);
      res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }
  
  // Get contacts
  static async getContacts(req, res) {
    try {
      const userId = req.user.userId;
      
      const contacts = await ContactService.getContacts(userId);
      
      res.status(200).json({
        success: true,
        data: contacts,
      });
    } catch (error) {
      console.error('[v0] Get contacts error:', error);
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }
  
  // Update contact
  static async updateContact(req, res) {
    try {
      const userId = req.user.userId;
      const { contactId } = req.params;
      const updates = req.body;
      
      const contact = await ContactService.updateContact(userId, contactId, updates);
      
      res.status(200).json({
        success: true,
        message: 'Contact updated successfully',
        data: contact,
      });
    } catch (error) {
      console.error('[v0] Update contact error:', error);
      res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }
  
  // Delete contact
  static async deleteContact(req, res) {
    try {
      const userId = req.user.userId;
      const { contactId } = req.params;
      
      await ContactService.deleteContact(userId, contactId);
      
      res.status(200).json({
        success: true,
        message: 'Contact deleted successfully',
      });
    } catch (error) {
      console.error('[v0] Delete contact error:', error);
      res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }
  
  // Block user
  static async blockUser(req, res) {
    try {
      const userId = req.user.userId;
      const { userId: userIdToBlock } = req.body;
      
      if (!userIdToBlock) {
        return res.status(400).json({
          success: false,
          message: 'User ID is required',
        });
      }
      
      await ContactService.blockUser(userId, userIdToBlock);
      
      res.status(200).json({
        success: true,
        message: 'User blocked successfully',
      });
    } catch (error) {
      console.error('[v0] Block user error:', error);
      res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }
  
  // Unblock user
  static async unblockUser(req, res) {
    try {
      const userId = req.user.userId;
      const { userId: userIdToUnblock } = req.params;
      
      await ContactService.unblockUser(userId, userIdToUnblock);
      
      res.status(200).json({
        success: true,
        message: 'User unblocked successfully',
      });
    } catch (error) {
      console.error('[v0] Unblock user error:', error);
      res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }
  
  // Get blocked users
  static async getBlockedUsers(req, res) {
    try {
      const userId = req.user.userId;
      
      const blockedUsers = await ContactService.getBlockedUsers(userId);
      
      res.status(200).json({
        success: true,
        data: blockedUsers,
      });
    } catch (error) {
      console.error('[v0] Get blocked users error:', error);
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }
}
