import { supabaseAdmin } from '../config/supabase.js';

export class ConversationService {

  // CREATE CONVERSATION (NO DUPLICATES)
  static async createConversation(userId, { type, participants, title, description, avatar_url }) {
    if (!participants?.length) {
      throw new Error('Participants required');
    }

    if (type === 'private') {
      const existing = await this.findPrivateConversation(userId, participants[0]);
      if (existing) return existing;
    }

    const conversationData = {
      type,
      name: title || null,
      created_by: userId,
    };

    // Add optional fields if provided
    if (description) {
      conversationData.description = description;
    }
    if (avatar_url) {
      conversationData.avatar_url = avatar_url;
    }

    const { data: conversation, error } = await supabaseAdmin
      .from('conversations')
      .insert(conversationData)
      .select()
      .single();

    if (error) throw error;

    const members = [
      { conversation_id: conversation.id, user_id: userId, role: 'owner' },
      ...participants.map(userId => ({
        conversation_id: conversation.id,
        user_id: userId,
        role: 'member',
      })),
    ];

    const { error: memberError } = await supabaseAdmin
      .from('conversation_participants')
      .insert(members);

    if (memberError) throw memberError;

    return conversation;
  }

  // PREVENT DUPLICATE PRIVATE CHATS
  static async findPrivateConversation(user1, user2) {
    const { data: user1Convos } = await supabaseAdmin
      .from('conversation_participants')
      .select(`
        conversation_id,
        conversations!inner(type)
      `)
      .eq('user_id', user1)
      .eq('conversations.type', 'private');

    if (!user1Convos?.length) return null;

    const convoIds = user1Convos.map(c => c.conversation_id);

    const { data: match } = await supabaseAdmin
      .from('conversation_participants')
      .select('conversation_id')
      .eq('user_id', user2)
      .in('conversation_id', convoIds)
      .maybeSingle();

    if (!match) return null;

    const { data: conversation } = await supabaseAdmin
      .from('conversations')
      .select('*')
      .eq('id', match.conversation_id)
      .single();

    return conversation;
  }

  static async getConversationById(conversationId, userId) {
    const { data: member } = await supabaseAdmin
      .from('conversation_participants')
      .select('id')
      .eq('conversation_id', conversationId)
      .eq('user_id', userId)
      .maybeSingle();

    if (!member) throw new Error('Access denied');

    const { data } = await supabaseAdmin
      .from('conversations')
      .select('*')
      .eq('id', conversationId)
      .single();

    return data;
  }

  static async getUserConversations(userId) {
    // Get user's conversations with participant data
    const { data: userConvos } = await supabaseAdmin
      .from('conversation_participants')
      .select('conversation_id, role')
      .eq('user_id', userId);

    if (!userConvos?.length) return [];

    const conversationIds = userConvos.map(c => c.conversation_id);

    // Get conversation details
    const { data: conversations } = await supabaseAdmin
      .from('conversations')
      .select('*')
      .in('id', conversationIds)
      .order('updated_at', { ascending: false });

    if (!conversations?.length) return [];

    // Get all participants for these conversations
    const { data: allParticipants, error: participantsError } = await supabaseAdmin
      .from('conversation_participants')
      .select('conversation_id, user_id, role, joined_at')
      .in('conversation_id', conversationIds);

    if (participantsError) {
      console.error('[ConversationService] Error loading participants:', participantsError);
      return conversations.map(conv => ({
        ...conv,
        role: userConvos.find(uc => uc.conversation_id === conv.id)?.role,
        participants: []
      }));
    }

    // Get all unique user IDs from participants
    const userIds = [...new Set(allParticipants.map(p => p.user_id))];

    // Fetch user data separately
    const { data: users, error: usersError } = await supabaseAdmin
      .from('users')
      .select('id, username, display_name, avatar_url, status, email')
      .in('id', userIds);

    if (usersError) {
      console.error('[ConversationService] Error loading users:', usersError);
    }

    // Create a map of user data for quick lookup
    const userMap = {};
    if (users) {
      users.forEach(user => {
        userMap[user.id] = user;
      });
    }

    // Combine data
    return conversations.map(conv => {
      const userRole = userConvos.find(uc => uc.conversation_id === conv.id)?.role;
      const participants = allParticipants
        ?.filter(p => p.conversation_id === conv.id)
        .map(p => ({
          id: p.user_id,
          user_id: p.user_id,
          role: p.role,
          joined_at: p.joined_at,
          user: userMap[p.user_id] || null
        })) || [];

      return {
        ...conv,
        role: userRole,
        participants
      };
    });
  }

  static async addParticipant(conversationId, actorId, newUserId, role = 'member') {
    await this.assertAdmin(conversationId, actorId);

    const { data, error } = await supabaseAdmin
      .from('conversation_participants')
      .insert({ conversation_id: conversationId, user_id: newUserId, role })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async removeParticipant(conversationId, actorId, targetId) {
    await this.assertAdmin(conversationId, actorId);

    await supabaseAdmin
      .from('conversation_participants')
      .delete()
      .eq('conversation_id', conversationId)
      .eq('user_id', targetId);
  }

  static async updateConversation(conversationId, actorId, updates) {
    await this.assertAdmin(conversationId, actorId);

    const { data, error } = await supabaseAdmin
      .from('conversations')
      .update(updates)
      .eq('id', conversationId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async deleteConversation(conversationId, actorId) {
    await this.assertAdmin(conversationId, actorId);

    await supabaseAdmin
      .from('conversations')
      .delete()
      .eq('id', conversationId);
  }

  static async assertAdmin(conversationId, userId) {
    const { data } = await supabaseAdmin
      .from('conversation_participants')
      .select('role')
      .eq('conversation_id', conversationId)
      .eq('user_id', userId)
      .single();

    if (!data || !['owner', 'admin'].includes(data.role)) {
      throw new Error('Admin permission required');
    }
  }
}
