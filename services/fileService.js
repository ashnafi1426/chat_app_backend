import { supabaseAdmin } from '../config/supabase.js';
import { v4 as uuidv4 } from 'uuid';

export class FileService {
  // Upload file
  static async uploadFile(userId, file, conversationId = null, messageId = null) {
    try {
      const fileExt = file.originalname.split('.').pop();
      const fileName = `${uuidv4()}.${fileExt}`;
      const filePath = `${userId}/${fileName}`;
      
      // Upload to Supabase Storage
      const { error: uploadError } = await supabaseAdmin.storage
        .from('chat-files')
        .upload(filePath, file.buffer, {
          contentType: file.mimetype,
          upsert: false,
        });
      
      if (uploadError) {
        throw new Error(uploadError.message);
      }
      
      // Get public URL
      const { data: urlData } = supabaseAdmin.storage
        .from('chat-files')
        .getPublicUrl(filePath);
      
      // Save file metadata to database
      const { data: fileRecord, error: dbError } = await supabaseAdmin
        .from('files')
        .insert({
          uploader_id: userId,
          conversation_id: conversationId,
          message_id: messageId,
          file_name: file.originalname,
          file_path: filePath,
          file_url: urlData.publicUrl,
          file_type: file.mimetype,
          file_size: file.size,
        })
        .select()
        .single();
      
      if (dbError) {
        // Rollback storage upload
        await supabaseAdmin.storage.from('chat-files').remove([filePath]);
        throw new Error(dbError.message);
      }
      
      return fileRecord;
    } catch (error) {
      throw new Error(`File upload failed: ${error.message}`);
    }
  }
  
  // Get file by ID
  static async getFile(fileId, userId) {
    const { data, error } = await supabaseAdmin
      .from('files')
      .select('*')
      .eq('id', fileId)
      .single();
    
    if (error || !data) {
      throw new Error('File not found');
    }
    
    // Check if user has access (is uploader or participant in conversation)
    if (data.uploader_id !== userId && data.conversation_id) {
      const { data: participant } = await supabaseAdmin
        .from('conversation_participants')
        .select('id')
        .eq('conversation_id', data.conversation_id)
        .eq('user_id', userId)
        .single();
      
      if (!participant) {
        throw new Error('Access denied');
      }
    }
    
    return data;
  }
  
  // Get files for conversation
  static async getConversationFiles(conversationId, userId, fileType = null) {
    // Verify user is participant
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
      .from('files')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false });
    
    if (fileType) {
      query = query.ilike('file_type', `${fileType}%`);
    }
    
    const { data, error } = await query;
    
    if (error) {
      throw new Error(error.message);
    }
    
    return data;
  }
  
  // Delete file
  static async deleteFile(fileId, userId) {
    // Get file
    const { data: file } = await supabaseAdmin
      .from('files')
      .select('*')
      .eq('id', fileId)
      .single();
    
    if (!file) {
      throw new Error('File not found');
    }
    
    // Check if user is uploader
    if (file.uploader_id !== userId) {
      throw new Error('Unauthorized to delete this file');
    }
    
    // Delete from storage
    await supabaseAdmin.storage
      .from('chat-files')
      .remove([file.file_path]);
    
    // Delete from database
    const { error } = await supabaseAdmin
      .from('files')
      .delete()
      .eq('id', fileId);
    
    if (error) {
      throw new Error(error.message);
    }
    
    return true;
  }
  
  // Get user's uploaded files
  static async getUserFiles(userId, limit = 50) {
    const { data, error } = await supabaseAdmin
      .from('files')
      .select('*')
      .eq('uploader_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);
    
    if (error) {
      throw new Error(error.message);
    }
    
    return data;
  }
}
