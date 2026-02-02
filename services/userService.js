import { supabaseAdmin } from '../config/supabase.js';

export class UserService {
  // Get user by ID
  static async getUserById(userId) {
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('id, username, email, display_name, avatar_url, bio, phone, status, last_seen, created_at')
      .eq('id', userId)
      .single();
    
    if (error) {
      console.error('[UserService] Get user by ID error:', error);
      throw new Error('User not found');
    }
    
    return data;
  }
  
  // Update user profile
  static async updateProfile(userId, updates) {
    const allowedFields = ['display_name', 'bio', 'phone', 'avatar_url'];
    const filteredUpdates = {};
    
    for (const key of allowedFields) {
      if (updates[key] !== undefined) {
        filteredUpdates[key] = updates[key];
      }
    }
    
    filteredUpdates.updated_at = new Date().toISOString();
    
    const { data, error } = await supabaseAdmin
      .from('users')
      .update(filteredUpdates)
      .eq('id', userId)
      .select()
      .single();
    
    if (error) {
      throw new Error(error.message);
    }
    
    return data;
  }
  
  // Update user status
  static async updateStatus(userId, status) {
    const validStatuses = ['online', 'offline', 'away', 'busy'];
    
    if (!validStatuses.includes(status)) {
      throw new Error('Invalid status');
    }
    
    const { data, error } = await supabaseAdmin
      .from('users')
      .update({ 
        status,
        last_seen: new Date().toISOString()
      })
      .eq('id', userId)
      .select()
      .single();
    
    if (error) {
      throw new Error(error.message);
    }
    
    return data;
  }
  
  // Search users
  static async searchUsers(query, currentUserId, limit = 20) {
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('id, username, display_name, avatar_url, status')
      .or(`username.ilike.%${query}%,display_name.ilike.%${query}%`)
      .neq('id', currentUserId)
      .limit(limit);
    
    if (error) {
      throw new Error(error.message);
    }
    
    return data;
  }
  
  // Get user settings
  static async getUserSettings(userId) {
    const { data, error } = await supabaseAdmin
      .from('user_settings')
      .select('*')
      .eq('user_id', userId)
      .single();
    
    if (error && error.code !== 'PGRST116') {
      throw new Error(error.message);
    }
    
    // Return default settings if none exist
    if (!data) {
      return {
        notifications_enabled: true,
        email_notifications: true,
        message_preview: true,
        read_receipts_enabled: true,
        typing_indicators_enabled: true,
        last_seen_visible: true,
        theme: 'auto',
        language: 'en',
      };
    }
    
    return data;
  }
  
  // Update user settings
  static async updateSettings(userId, settings) {
    const { data, error } = await supabaseAdmin
      .from('user_settings')
      .upsert({
        user_id: userId,
        ...settings,
        updated_at: new Date().toISOString()
      })
      .select()
      .single();
    
    if (error) {
      throw new Error(error.message);
    }
    
    return data;
  }
  
  // Get user's conversations
  static async getUserConversations(userId) {
    // First get conversation participants
    const { data: participants, error: participantsError } = await supabaseAdmin
      .from('conversation_participants')
      .select('conversation_id, role, last_read_at')
      .eq('user_id', userId);
    
    if (participantsError) {
      throw new Error(participantsError.message);
    }
    
    if (!participants || participants.length === 0) {
      return [];
    }
    
    // Then get conversation details
    const conversationIds = participants.map(p => p.conversation_id);
    const { data: conversations, error: conversationsError } = await supabaseAdmin
      .from('conversations')
      .select('id, name, type, avatar_url, created_at, updated_at')
      .in('id', conversationIds)
      .order('updated_at', { ascending: false });
    
    if (conversationsError) {
      throw new Error(conversationsError.message);
    }
    
    // Combine the data
    return conversations.map(conv => {
      const participant = participants.find(p => p.conversation_id === conv.id);
      return {
        ...conv,
        role: participant.role,
        last_read_at: participant.last_read_at
      };
    });
  }
}
