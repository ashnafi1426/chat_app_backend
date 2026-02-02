import { supabaseAdmin } from '../config/supabase.js';

export class MessageService {

  // ===============================
  // SEND MESSAGE
  // ===============================
  static async sendMessage(userId, data) {
    const { conversationId, content, type = 'text', replyToId } = data;

    const allowedTypes = ['text', 'image', 'video', 'file', 'audio'];
    if (!allowedTypes.includes(type)) {
      throw new Error('Invalid message type');
    }

    const { data: participant } = await supabaseAdmin
      .from('conversation_participants')
      .select('id')
      .eq('conversation_id', conversationId)
      .eq('user_id', userId)
      .single();

    if (!participant) {
      throw new Error('User is not a participant in this conversation');
    }

    const { data: message, error } = await supabaseAdmin
      .from('messages')
      .insert({
        conversation_id: conversationId,
        sender_id: userId,
        content,
        message_type: type,
        reply_to_id: replyToId || null,
      })
      .select('*')
      .single();

    if (error) throw new Error(error.message);

    await supabaseAdmin
      .from('conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', conversationId);

    // Create status records for all recipients (graceful degradation)
    try {
      // Get all participants except the sender
      const { data: participants } = await supabaseAdmin
        .from('conversation_participants')
        .select('user_id')
        .eq('conversation_id', conversationId)
        .neq('user_id', userId);

      if (participants && participants.length > 0) {
        const recipientIds = participants.map(p => p.user_id);
        await this.createMessageStatus(message.id, recipientIds);
      }
    } catch (statusError) {
      console.error('Failed to create message status (non-critical):', statusError);
      // Don't throw - message was sent successfully
    }

    return message;
  }

  // ===============================
  // GET MESSAGES
  // ===============================
  static async getMessages(conversationId, userId, limit, before) {
    const { data: participant } = await supabaseAdmin
      .from('conversation_participants')
      .select('id')
      .eq('conversation_id', conversationId)
      .eq('user_id', userId)
      .single();

    if (!participant) {
      throw new Error('User is not a participant in this conversation');
    }

    let query = supabaseAdmin
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (before) {
      query = query.lt('created_at', before);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    // Load reactions separately to avoid relationship issues
    const messageIds = data.map(m => m.id);
    let reactions = [];
    
    if (messageIds.length > 0) {
      const { data: reactionsData } = await supabaseAdmin
        .from('message_reactions')
        .select('*')
        .in('message_id', messageIds);
      
      if (reactionsData && reactionsData.length > 0) {
        // Get unique user IDs from reactions
        const userIds = [...new Set(reactionsData.map(r => r.user_id))];
        
        // Load user data
        const { data: usersData } = await supabaseAdmin
          .from('users')
          .select('id, username, display_name, avatar_url')
          .in('id', userIds);
        
        // Map users to reactions (use 'user' for consistency with frontend)
        reactions = reactionsData.map(reaction => ({
          ...reaction,
          user: usersData?.find(u => u.id === reaction.user_id) || null
        }));
      }
    }

    // Attach reactions to messages
    const messagesWithReactions = data.map(message => ({
      ...message,
      reactions: reactions.filter(r => r.message_id === message.id)
    }));

    // Enrich messages with status data
    const enrichedMessages = await Promise.all(
      messagesWithReactions.map(async (message) => {
        try {
          // Get status for this message and current user
          const { data: status } = await supabaseAdmin
            .from('message_status')
            .select('status, delivered_at, read_at')
            .eq('message_id', message.id)
            .eq('user_id', userId)
            .single();

          // If user is the sender, get aggregated status
          let aggregatedStatus = 'sent';
          if (message.sender_id === userId) {
            aggregatedStatus = await this.aggregateGroupStatus(message.id);
          }

          return {
            ...message,
            status: message.sender_id === userId ? aggregatedStatus : (status?.status || 'sent'),
            delivered_at: status?.delivered_at || null,
            read_at: status?.read_at || null,
          };
        } catch (statusError) {
          // Default to 'sent' if status data is missing
          return {
            ...message,
            status: 'sent',
            delivered_at: null,
            read_at: null,
          };
        }
      })
    );

    return enrichedMessages.reverse();
  }

  // ===============================
  // EDIT MESSAGE
  // ===============================
  static async editMessage(messageId, userId, content) {
    const { data: message } = await supabaseAdmin
      .from('messages')
      .select('sender_id')
      .eq('id', messageId)
      .single();

    if (!message || message.sender_id !== userId) {
      throw new Error('Unauthorized');
    }

    const { data, error } = await supabaseAdmin
      .from('messages')
      .update({
        content,
        is_edited: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', messageId)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  }

  // ===============================
  // DELETE MESSAGE
  // ===============================
  static async deleteMessage(messageId, userId) {
    const { data: message } = await supabaseAdmin
      .from('messages')
      .select('sender_id')
      .eq('id', messageId)
      .single();

    if (!message || message.sender_id !== userId) {
      throw new Error('Unauthorized');
    }

    const { error } = await supabaseAdmin
      .from('messages')
      .delete()
      .eq('id', messageId);

    if (error) throw new Error(error.message);
    return true;
  }

  // ===============================
  // REACTIONS (Telegram-style: One reaction per user per message)
  // ===============================
  static async addReaction(messageId, userId, emoji) {
    // Check if user already has ANY reaction on this message
    const { data: existingReactions } = await supabaseAdmin
      .from('message_reactions')
      .select('id, emoji')
      .eq('message_id', messageId)
      .eq('user_id', userId);

    // If user clicked the same emoji they already have, remove it (toggle off)
    if (existingReactions && existingReactions.length > 0) {
      const sameEmojiReaction = existingReactions.find(r => r.emoji === emoji);
      
      if (sameEmojiReaction) {
        // Remove the existing reaction (toggle off)
        await supabaseAdmin
          .from('message_reactions')
          .delete()
          .eq('id', sameEmojiReaction.id);
        return null; // Return null to indicate removal
      } else {
        // User clicked a different emoji - replace the old one
        // Delete all existing reactions from this user on this message
        await supabaseAdmin
          .from('message_reactions')
          .delete()
          .eq('message_id', messageId)
          .eq('user_id', userId);
      }
    }

    // Add new reaction - load user data separately to avoid relationship issues
    const { data: reaction, error } = await supabaseAdmin
      .from('message_reactions')
      .insert({ message_id: messageId, user_id: userId, emoji })
      .select('*')
      .single();

    if (error) throw new Error(error.message);

    // Load user data separately
    const { data: userData } = await supabaseAdmin
      .from('users')
      .select('id, username, display_name, avatar_url')
      .eq('id', userId)
      .single();

    // Attach user data to reaction (use 'user' for consistency with frontend)
    return {
      ...reaction,
      user: userData || null
    };
  }

  // ===============================
  // MARK AS READ
  // ===============================
  static async markAsRead(conversationId, userId) {
    const { error } = await supabaseAdmin
      .from('conversation_participants')
      .update({ last_read_at: new Date().toISOString() })
      .eq('conversation_id', conversationId)
      .eq('user_id', userId);

    if (error) throw new Error(error.message);
    return true;
  }

  // ===============================
  // SEARCH (SECURE)
  // ===============================
  static async searchMessages(userId, query, conversationId) {
    let q = supabaseAdmin
      .from('messages')
      .select(`
        *,
        conversation_participants!inner ( user_id )
      `)
      .eq('conversation_participants.user_id', userId)
      .ilike('content', `%${query}%`)
      .order('created_at', { ascending: false })
      .limit(50);

    if (conversationId) {
      q = q.eq('conversation_id', conversationId);
    }

    const { data, error } = await q;
    if (error) throw new Error(error.message);

    return data;
  }

  // ===============================
  // READ RECEIPTS - STATUS TRACKING
  // ===============================

  /**
   * Create initial status records for a new message
   * @param {string} messageId - Message ID
   * @param {string[]} recipientIds - Array of recipient user IDs
   * @returns {Promise<void>}
   */
  static async createMessageStatus(messageId, recipientIds) {
    try {
      const statusRecords = recipientIds.map(userId => ({
        message_id: messageId,
        user_id: userId,
        status: 'sent',
        created_at: new Date().toISOString()
      }));

      // Use upsert to handle duplicates gracefully
      const { error } = await supabaseAdmin
        .from('message_status')
        .upsert(statusRecords, {
          onConflict: 'message_id,user_id',
          ignoreDuplicates: false // Update if exists
        });

      if (error) {
        console.error('Failed to create message status:', error);
        // Don't throw - graceful degradation
      }
    } catch (error) {
      console.error('Error creating message status:', error);
      // Don't throw - graceful degradation
    }
  }

  /**
   * Update message status for a user with progression validation
   * @param {string} messageId - Message ID
   * @param {string} userId - User ID
   * @param {string} status - New status ('sent'|'delivered'|'read')
   * @returns {Promise<Object>} Updated status record
   */
  static async updateMessageStatus(messageId, userId, status) {
    const validStatuses = ['sent', 'delivered', 'read'];
    if (!validStatuses.includes(status)) {
      throw new Error('Invalid status value');
    }

    // Get current status
    const { data: currentStatus } = await supabaseAdmin
      .from('message_status')
      .select('status')
      .eq('message_id', messageId)
      .eq('user_id', userId)
      .single();

    // Validate status progression (sent -> delivered -> read)
    if (currentStatus) {
      const statusOrder = { sent: 0, delivered: 1, read: 2 };
      if (statusOrder[status] <= statusOrder[currentStatus.status]) {
        // Don't downgrade status
        return currentStatus;
      }
    }

    // Update status with appropriate timestamp
    const updateData = {
      status,
      ...(status === 'delivered' && { delivered_at: new Date().toISOString() }),
      ...(status === 'read' && { read_at: new Date().toISOString() })
    };

    const { data, error } = await supabaseAdmin
      .from('message_status')
      .update(updateData)
      .eq('message_id', messageId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  }

  /**
   * Get message status for display
   * @param {string[]} messageIds - Array of message IDs
   * @param {string} requesterId - User requesting status
   * @returns {Promise<Object[]>} Status records
   */
  static async getMessageStatus(messageIds, requesterId) {
    // Verify requester is the sender of these messages
    const { data: messages } = await supabaseAdmin
      .from('messages')
      .select('id, sender_id')
      .in('id', messageIds);

    const authorizedMessageIds = messages
      .filter(m => m.sender_id === requesterId)
      .map(m => m.id);

    if (authorizedMessageIds.length === 0) {
      throw new Error('Unauthorized to view message status');
    }

    // Get all status records for these messages
    const { data, error } = await supabaseAdmin
      .from('message_status')
      .select(`
        *,
        users:user_id (
          id,
          username,
          display_name,
          avatar_url
        )
      `)
      .in('message_id', authorizedMessageIds)
      .order('created_at', { ascending: true });

    if (error) throw new Error(error.message);
    return data;
  }

  /**
   * Aggregate status for group messages
   * @param {string} messageId - Message ID
   * @returns {Promise<string>} Overall status ('sent'|'delivered'|'read')
   */
  static async aggregateGroupStatus(messageId) {
    const { data: statuses, error } = await supabaseAdmin
      .from('message_status')
      .select('status')
      .eq('message_id', messageId);

    if (error || !statuses || statuses.length === 0) {
      return 'sent';
    }

    // If any recipient has 'sent': return 'sent'
    if (statuses.some(s => s.status === 'sent')) {
      return 'sent';
    }

    // If all have 'read': return 'read'
    if (statuses.every(s => s.status === 'read')) {
      return 'read';
    }

    // Otherwise: return 'delivered'
    return 'delivered';
  }

  /**
   * Mark messages as read for a user (with privacy check)
   * @param {string} userId - User marking messages as read
   * @param {string[]} messageIds - Array of message IDs to mark
   * @returns {Promise<Object>} Updated message statuses
   */
  static async markMessagesAsRead(userId, messageIds) {
    if (!messageIds || messageIds.length === 0) {
      throw new Error('No message IDs provided');
    }

    // Verify user is recipient (not sender) of these messages
    const { data: messages } = await supabaseAdmin
      .from('messages')
      .select('id, sender_id')
      .in('id', messageIds);

    const validMessageIds = messages
      .filter(m => m.sender_id !== userId)
      .map(m => m.id);

    if (validMessageIds.length === 0) {
      throw new Error('Cannot mark own messages as read');
    }

    // Check user's read_receipts_enabled setting
    const { data: settings } = await supabaseAdmin
      .from('user_settings')
      .select('read_receipts_enabled')
      .eq('user_id', userId)
      .single();

    const readReceiptsEnabled = settings?.read_receipts_enabled !== false;

    // Update status to 'read' only if privacy allows
    const targetStatus = readReceiptsEnabled ? 'read' : 'delivered';
    const timestamp = new Date().toISOString();

    const { data, error } = await supabaseAdmin
      .from('message_status')
      .update({
        status: targetStatus,
        ...(targetStatus === 'read' && { read_at: timestamp }),
        ...(targetStatus === 'delivered' && { delivered_at: timestamp })
      })
      .eq('user_id', userId)
      .in('message_id', validMessageIds)
      .in('status', ['sent', 'delivered']) // Only update if not already read
      .select();

    if (error) throw new Error(error.message);

    return {
      success: true,
      updated: data || [],
      readReceiptsEnabled
    };
  }
}
