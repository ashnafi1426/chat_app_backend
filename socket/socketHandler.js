import jwt from 'jsonwebtoken';
import { config } from '../config/config.js';
import { supabaseAdmin } from '../config/supabase.js';

const connectedUsers = new Map(); // userId -> socketId mapping

export const initializeSocket = (io) => {
  // Middleware for authentication
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      
      if (!token) {
        return next(new Error('Authentication required'));
      }
      
      const decoded = jwt.verify(token, config.jwt.secret);
      socket.userId = decoded.userId;
      socket.username = decoded.username;
      
      next();
    } catch (error) {
      next(new Error('Invalid token'));
    }
  });
  
  io.on('connection', async (socket) => {
    console.log(`[v0] User connected: ${socket.username} (${socket.userId})`);
    
    // Store connected user
    connectedUsers.set(socket.userId, socket.id);
    
    // Update user status to online
    await updateUserStatus(socket.userId, 'online');
    
    // Broadcast online status to contacts
    await broadcastStatusToContacts(socket.userId, 'online', io);
    
    // Join user's personal room
    socket.join(`user:${socket.userId}`);
    
    // Auto-join all user's conversations
    await joinUserConversations(socket);
    
    // Handle joining conversation rooms
    socket.on('join-conversation', async (conversationId) => {
      // Verify user is a participant
      const isParticipant = await verifyParticipant(conversationId, socket.userId);
      if (isParticipant) {
        socket.join(conversationId);
        console.log(`[v0] ${socket.username} joined conversation: ${conversationId}`);
        
        // Notify others in the conversation
        socket.to(conversationId).emit('user-joined-conversation', {
          userId: socket.userId,
          username: socket.username,
          conversationId,
        });
      } else {
        console.log(`[v0] ${socket.username} denied access to conversation: ${conversationId}`);
      }
    });
    
    // Handle leaving conversation rooms
    socket.on('leave-conversation', (conversationId) => {
      socket.leave(conversationId);
      console.log(`[v0] ${socket.username} left conversation: ${conversationId}`);
    });
    
    // Handle new message
    socket.on('new-message', async (data) => {
      const { conversationId, content, replyToId, type = 'text' } = data;
      
      // Verify user is a participant
      const isParticipant = await verifyParticipant(conversationId, socket.userId);
      if (!isParticipant) {
        socket.emit('error', { message: 'Not authorized to send messages in this conversation' });
        return;
      }
      
      console.log(`[v0] New message from ${socket.username} in conversation ${conversationId}`);
      
      // Get sender user data for richer notifications
      const { data: senderData } = await supabaseAdmin
        .from('users')
        .select('id, username, display_name, avatar_url')
        .eq('id', socket.userId)
        .single();
      
      // Broadcast to conversation participants (scoped to conversation room)
      // The actual message is already saved via API, just notify others
      io.to(conversationId).emit('new-message', {
        conversationId,
        content,
        replyToId,
        type,
        senderId: socket.userId,
        senderUsername: socket.username,
        sender: senderData || {
          id: socket.userId,
          username: socket.username,
          display_name: socket.username,
        },
        timestamp: new Date().toISOString(),
      });
    });
    
    // Handle typing indicator
    socket.on('typing-start', (data) => {
      const { conversationId } = data;
      socket.to(conversationId).emit('user-typing', {
        userId: socket.userId,
        username: socket.username,
        conversationId,
      });
    });
    
    socket.on('typing-stop', (data) => {
      const { conversationId } = data;
      socket.to(conversationId).emit('user-stopped-typing', {
        userId: socket.userId,
        conversationId,
      });
    });
    
    // Handle message read
    socket.on('message-read', async (data) => {
      const { messageId, conversationId } = data;
      
      // Broadcast read receipt
      io.to(conversationId).emit('message-read-receipt', {
        messageId,
        userId: socket.userId,
        readAt: new Date().toISOString(),
      });
    });
    
    // ===============================
    // READ RECEIPTS - MESSAGE STATUS EVENTS
    // ===============================
    
    // Handle message delivered acknowledgment
    socket.on('message-delivered', async (data) => {
      try {
        const { message_id, conversation_id } = data;
        
        // Verify user is a participant
        const isParticipant = await verifyParticipant(conversation_id, socket.userId);
        if (!isParticipant) {
          return;
        }
        
        // Import MessageService dynamically to avoid circular dependency
        const { MessageService } = await import('../services/messageService.js');
        
        // Update message status to 'delivered'
        const updatedStatus = await MessageService.updateMessageStatus(
          message_id,
          socket.userId,
          'delivered'
        );
        
        // Get the message sender
        const { data: message } = await supabaseAdmin
          .from('messages')
          .select('sender_id')
          .eq('id', message_id)
          .single();
        
        if (message && message.sender_id) {
          // Emit 'message-delivered' event to message sender
          io.to(`user:${message.sender_id}`).emit('message-delivered', {
            message_id,
            user_id: socket.userId,
            status: 'delivered',
            delivered_at: updatedStatus.delivered_at,
          });
        }
      } catch (error) {
        console.error('[Socket] Error handling message-delivered:', error);
      }
    });
    
    // Handle message read notification
    socket.on('message-read', async (data) => {
      try {
        const { message_ids, conversation_id } = data;
        
        if (!message_ids || !Array.isArray(message_ids)) {
          return;
        }
        
        // Verify user is a participant
        const isParticipant = await verifyParticipant(conversation_id, socket.userId);
        if (!isParticipant) {
          return;
        }
        
        // Import services dynamically
        const { MessageService } = await import('../services/messageService.js');
        const { PrivacyController } = await import('../services/privacyController.js');
        
        // Check privacy settings
        const readReceiptsEnabled = await PrivacyController.checkReadReceiptsEnabled(socket.userId);
        
        if (!readReceiptsEnabled) {
          // User has disabled read receipts, don't send read status
          return;
        }
        
        // Update message status to 'read' for each message
        for (const message_id of message_ids) {
          try {
            const updatedStatus = await MessageService.updateMessageStatus(
              message_id,
              socket.userId,
              'read'
            );
            
            // Get the message sender
            const { data: message } = await supabaseAdmin
              .from('messages')
              .select('sender_id')
              .eq('id', message_id)
              .single();
            
            if (message && message.sender_id && message.sender_id !== socket.userId) {
              // Emit 'message-read' event to message sender
              io.to(`user:${message.sender_id}`).emit('message-read', {
                message_id,
                user_id: socket.userId,
                status: 'read',
                read_at: updatedStatus.read_at,
              });
            }
          } catch (error) {
            console.error(`[Socket] Error updating status for message ${message_id}:`, error);
          }
        }
      } catch (error) {
        console.error('[Socket] Error handling message-read:', error);
      }
    });
    
    // ===============================
    // END READ RECEIPTS EVENTS
    // ===============================
    
    // Handle message reaction
    socket.on('message-react', (data) => {
      const { messageId, conversationId, reaction } = data;
      
      io.to(conversationId).emit('message-reaction-added', {
        messageId,
        userId: socket.userId,
        username: socket.username,
        reaction,
        timestamp: new Date().toISOString(),
      });
    });
    
    // Handle status update
    socket.on('status-update', async (status) => {
      await updateUserStatus(socket.userId, status);
      await broadcastStatusToContacts(socket.userId, status, io);
    });
    
    // Handle disconnect
    socket.on('disconnect', async () => {
      console.log(`[v0] User disconnected: ${socket.username} (${socket.userId})`);
      
      connectedUsers.delete(socket.userId);
      
      // Update user status to offline
      await updateUserStatus(socket.userId, 'offline');
      
      // Broadcast offline status to contacts
      await broadcastStatusToContacts(socket.userId, 'offline', io);
    });
  });
};

// Helper function to join user's conversations
async function joinUserConversations(socket) {
  try {
    const { data: participants } = await supabaseAdmin
      .from('conversation_participants')
      .select('conversation_id')
      .eq('user_id', socket.userId);
    
    if (participants) {
      participants.forEach(p => {
        socket.join(p.conversation_id);
      });
      console.log(`[v0] ${socket.username} auto-joined ${participants.length} conversations`);
    }
  } catch (error) {
    console.error('[v0] Error joining user conversations:', error);
  }
}

// Helper function to verify user is a participant
async function verifyParticipant(conversationId, userId) {
  try {
    const { data } = await supabaseAdmin
      .from('conversation_participants')
      .select('id')
      .eq('conversation_id', conversationId)
      .eq('user_id', userId)
      .single();
    
    return !!data;
  } catch (error) {
    return false;
  }
}

// Helper function to update user status
async function updateUserStatus(userId, status) {
  try {
    await supabaseAdmin
      .from('users')
      .update({ 
        status, 
        last_seen: new Date().toISOString() 
      })
      .eq('id', userId);
  } catch (error) {
    console.error('[v0] Error updating user status:', error);
  }
}

// Helper function to broadcast status to user's contacts
async function broadcastStatusToContacts(userId, status, io) {
  try {
    // Get user's contacts
    const { data: contacts } = await supabaseAdmin
      .from('contacts')
      .select('user_id, contact_user_id')
      .or(`user_id.eq.${userId},contact_user_id.eq.${userId}`);
    
    // Broadcast to each contact
    contacts?.forEach(contact => {
      const contactId = contact.user_id === userId ? contact.contact_user_id : contact.user_id;
      io.to(`user:${contactId}`).emit('contact-status-changed', {
        userId,
        status,
        timestamp: new Date().toISOString(),
      });
    });
  } catch (error) {
    console.error('[v0] Error broadcasting status:', error);
  }
}

export { connectedUsers };
