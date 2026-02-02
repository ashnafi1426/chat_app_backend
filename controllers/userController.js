import { UserService } from '../services/userService.js';

export class UserController {
  // Get current user profile
  static async getCurrentUser(req, res) {
    try {
      const userId = req.user.userId;
      const user = await UserService.getUserById(userId);
      
      res.status(200).json({
        success: true,
        data: user,
      });
    } catch (error) {
      console.error('[v0] Get current user error:', error);
      res.status(404).json({
        success: false,
        message: error.message,
      });
    }
  }
  
  // Get user by ID
  static async getUserById(req, res) {
    try {
      const { userId } = req.params;
      const user = await UserService.getUserById(userId);
      
      res.status(200).json({
        success: true,
        data: user,
      });
    } catch (error) {
      console.error('[v0] Get user by ID error:', error);
      res.status(404).json({
        success: false,
        message: error.message,
      });
    }
  }
  
  // Update user profile
  static async updateProfile(req, res) {
    try {
      const userId = req.user.userId;
      const updates = req.body;
      
      const user = await UserService.updateProfile(userId, updates);
      
      res.status(200).json({
        success: true,
        message: 'Profile updated successfully',
        data: user,
      });
    } catch (error) {
      console.error('[v0] Update profile error:', error);
      res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }
  
  // Update user status
  static async updateStatus(req, res) {
    try {
      const userId = req.user.userId;
      const { status } = req.body;
      
      if (!status) {
        return res.status(400).json({
          success: false,
          message: 'Status is required',
        });
      }
      
      const user = await UserService.updateStatus(userId, status);
      
      res.status(200).json({
        success: true,
        message: 'Status updated successfully',
        data: user,
      });
    } catch (error) {
      console.error('[v0] Update status error:', error);
      res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }
  
  // Search users
  static async searchUsers(req, res) {
    try {
      const userId = req.user.userId;
      const { q, limit } = req.query;
      
      if (!q || q.trim().length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Search query is required',
        });
      }
      
      const users = await UserService.searchUsers(q, userId, parseInt(limit) || 20);
      
      res.status(200).json({
        success: true,
        data: users,
      });
    } catch (error) {
      console.error('[v0] Search users error:', error);
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }
  
  // Get user settings
  static async getSettings(req, res) {
    try {
      const userId = req.user.userId;
      const settings = await UserService.getUserSettings(userId);
      
      res.status(200).json({
        success: true,
        data: settings,
      });
    } catch (error) {
      console.error('[v0] Get settings error:', error);
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }
  
  // Update user settings
  static async updateSettings(req, res) {
    try {
      const userId = req.user.userId;
      const settings = req.body;
      
      const updatedSettings = await UserService.updateSettings(userId, settings);
      
      res.status(200).json({
        success: true,
        message: 'Settings updated successfully',
        data: updatedSettings,
      });
    } catch (error) {
      console.error('[v0] Update settings error:', error);
      res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }
  
  // Get user's conversations
  static async getConversations(req, res) {
    try {
      const userId = req.user.userId;
      const conversations = await UserService.getUserConversations(userId);
      
      res.status(200).json({
        success: true,
        data: conversations,
      });
    } catch (error) {
      console.error('[v0] Get conversations error:', error);
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }
}
