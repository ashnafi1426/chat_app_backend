import { supabaseAdmin } from '../config/supabase.js';

export class ContactService {
  // Send contact request
  static async sendContactRequest(userId, contactUserId) {
    // Check if request already exists
    const { data: existing } = await supabaseAdmin
      .from('contact_requests')
      .select('id, status')
      .or(`and(sender_id.eq.${userId},receiver_id.eq.${contactUserId}),and(sender_id.eq.${contactUserId},receiver_id.eq.${userId})`)
      .single();
    
    if (existing) {
      if (existing.status === 'pending') {
        throw new Error('Contact request already sent');
      }
      if (existing.status === 'accepted') {
        throw new Error('Already contacts');
      }
    }
    
    // Create contact request
    const { data, error } = await supabaseAdmin
      .from('contact_requests')
      .insert({
        sender_id: userId,
        receiver_id: contactUserId,
        status: 'pending',
      })
      .select()
      .single();
    
    if (error) {
      throw new Error(error.message);
    }
    
    // Fetch sender and receiver details
    const { data: sender } = await supabaseAdmin
      .from('users')
      .select('id, username, display_name, avatar_url')
      .eq('id', userId)
      .single();
    
    const { data: receiver } = await supabaseAdmin
      .from('users')
      .select('id, username, display_name, avatar_url')
      .eq('id', contactUserId)
      .single();
    
    return {
      ...data,
      sender,
      receiver
    };
  }
  
  // Get contact requests
  static async getContactRequests(userId, type = 'received') {
    const column = type === 'received' ? 'receiver_id' : 'sender_id';
    const otherColumn = type === 'received' ? 'sender_id' : 'receiver_id';
    
    const { data, error } = await supabaseAdmin
      .from('contact_requests')
      .select('*')
      .eq(column, userId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    
    if (error) {
      throw new Error(error.message);
    }
    
    // Fetch user details for each request
    const requestsWithDetails = await Promise.all(
      data.map(async (request) => {
        const { data: userData } = await supabaseAdmin
          .from('users')
          .select('id, username, display_name, avatar_url, status')
          .eq('id', request[otherColumn])
          .single();
        
        return {
          ...request,
          [type === 'received' ? 'sender' : 'receiver']: userData
        };
      })
    );
    
    return requestsWithDetails;
  }
  
  // Accept contact request
  static async acceptContactRequest(userId, requestId) {
    // Get request
    const { data: request } = await supabaseAdmin
      .from('contact_requests')
      .select('*')
      .eq('id', requestId)
      .eq('receiver_id', userId)
      .single();
    
    if (!request) {
      throw new Error('Contact request not found');
    }
    
    // Update request status
    await supabaseAdmin
      .from('contact_requests')
      .update({ status: 'accepted' })
      .eq('id', requestId);
    
    // Create contact relationship
    const { data, error } = await supabaseAdmin
      .from('contacts')
      .insert({
        user_id: userId,
        contact_user_id: request.sender_id,
      })
      .select()
      .single();
    
    if (error) {
      throw new Error(error.message);
    }
    
    // Create reciprocal contact
    await supabaseAdmin
      .from('contacts')
      .insert({
        user_id: request.sender_id,
        contact_user_id: userId,
      });
    
    return data;
  }
  
  // Reject contact request
  static async rejectContactRequest(userId, requestId) {
    const { data: request } = await supabaseAdmin
      .from('contact_requests')
      .select('id')
      .eq('id', requestId)
      .eq('receiver_id', userId)
      .single();
    
    if (!request) {
      throw new Error('Contact request not found');
    }
    
    const { error } = await supabaseAdmin
      .from('contact_requests')
      .update({ status: 'rejected' })
      .eq('id', requestId);
    
    if (error) {
      throw new Error(error.message);
    }
    
    return true;
  }
  
  // Get contacts
  static async getContacts(userId) {
    const { data, error } = await supabaseAdmin
      .from('contacts')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    
    if (error) {
      throw new Error(error.message);
    }
    
    // Fetch user details for each contact
    const contactsWithDetails = await Promise.all(
      data.map(async (contact) => {
        const { data: userData } = await supabaseAdmin
          .from('users')
          .select('id, username, display_name, avatar_url, status, last_seen, bio')
          .eq('id', contact.contact_user_id)
          .single();
        
        return {
          ...userData,
          contactId: contact.id,
          nickname: contact.nickname,
          isFavorite: contact.is_favorite,
          isBlocked: contact.is_blocked,
        };
      })
    );
    
    return contactsWithDetails;
  }
  
  // Update contact
  static async updateContact(userId, contactId, updates) {
    const allowedFields = ['nickname', 'is_favorite'];
    const filteredUpdates = {};
    
    for (const key of allowedFields) {
      if (updates[key] !== undefined) {
        filteredUpdates[key] = updates[key];
      }
    }
    
    const { data, error } = await supabaseAdmin
      .from('contacts')
      .update(filteredUpdates)
      .eq('id', contactId)
      .eq('user_id', userId)
      .select()
      .single();
    
    if (error) {
      throw new Error(error.message);
    }
    
    return data;
  }
  
  // Delete contact
  static async deleteContact(userId, contactId) {
    const { data: contact } = await supabaseAdmin
      .from('contacts')
      .select('contact_user_id')
      .eq('id', contactId)
      .eq('user_id', userId)
      .single();
    
    if (!contact) {
      throw new Error('Contact not found');
    }
    
    // Delete both sides of the contact relationship
    await supabaseAdmin
      .from('contacts')
      .delete()
      .or(`and(user_id.eq.${userId},contact_user_id.eq.${contact.contact_user_id}),and(user_id.eq.${contact.contact_user_id},contact_user_id.eq.${userId})`);
    
    return true;
  }
  
  // Block user
  static async blockUser(userId, userIdToBlock) {
    const { data, error } = await supabaseAdmin
      .from('blocked_users')
      .insert({
        blocker_id: userId,
        blocked_id: userIdToBlock,
      })
      .select()
      .single();
    
    if (error) {
      throw new Error(error.message);
    }
    
    // Update contact status if exists
    await supabaseAdmin
      .from('contacts')
      .update({ is_blocked: true })
      .eq('user_id', userId)
      .eq('contact_user_id', userIdToBlock);
    
    return data;
  }
  
  // Unblock user
  static async unblockUser(userId, userIdToUnblock) {
    await supabaseAdmin
      .from('blocked_users')
      .delete()
      .eq('blocker_id', userId)
      .eq('blocked_id', userIdToUnblock);
    
    // Update contact status if exists
    await supabaseAdmin
      .from('contacts')
      .update({ is_blocked: false })
      .eq('user_id', userId)
      .eq('contact_user_id', userIdToUnblock);
    
    return true;
  }
  
  // Get blocked users
  static async getBlockedUsers(userId) {
    const { data, error } = await supabaseAdmin
      .from('blocked_users')
      .select('*')
      .eq('blocker_id', userId);
    
    if (error) {
      throw new Error(error.message);
    }
    
    // Fetch user details for each blocked user
    const blockedUsersWithDetails = await Promise.all(
      data.map(async (blocked) => {
        const { data: userData } = await supabaseAdmin
          .from('users')
          .select('id, username, display_name, avatar_url')
          .eq('id', blocked.blocked_id)
          .single();
        
        return userData;
      })
    );
    
    return blockedUsersWithDetails;
  }
}
