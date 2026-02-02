import { supabaseAdmin } from '../config/supabase.js';

/**
 * PrivacyController
 * Enforces read receipt privacy settings
 */
export class PrivacyController {
  
  /**
   * Check if user has read receipts enabled
   * @param {string} userId - User ID to check
   * @returns {Promise<boolean>} True if enabled
   */
  static async checkReadReceiptsEnabled(userId) {
    try {
      const { data: settings } = await supabaseAdmin
        .from('user_settings')
        .select('read_receipts_enabled')
        .eq('user_id', userId)
        .single();

      // Default to true if no setting exists
      return settings?.read_receipts_enabled !== false;
    } catch (error) {
      console.error('Error checking read receipts setting:', error);
      // Default to true on error
      return true;
    }
  }

  /**
   * Filter status update based on privacy settings
   * @param {string} userId - User viewing message
   * @param {string} requestedStatus - Requested status update
   * @returns {Promise<string>} Allowed status update
   */
  static async filterStatusUpdate(userId, requestedStatus) {
    // Check read_receipts_enabled setting
    const readReceiptsEnabled = await this.checkReadReceiptsEnabled(userId);

    // If disabled and requestedStatus is 'read': return 'delivered'
    if (!readReceiptsEnabled && requestedStatus === 'read') {
      return 'delivered';
    }

    // Otherwise return requestedStatus
    return requestedStatus;
  }

  /**
   * Get user privacy settings
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Privacy settings
   */
  static async getUserPrivacySettings(userId) {
    try {
      const { data: settings, error } = await supabaseAdmin
        .from('user_settings')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error) {
        // Return default settings if not found
        return {
          read_receipts_enabled: true,
          typing_indicators_enabled: true,
          last_seen_visible: true,
          profile_photo_visible: 'everyone'
        };
      }

      return settings;
    } catch (error) {
      console.error('Error getting privacy settings:', error);
      // Return default settings on error
      return {
        read_receipts_enabled: true,
        typing_indicators_enabled: true,
        last_seen_visible: true,
        profile_photo_visible: 'everyone'
      };
    }
  }

  /**
   * Update user privacy settings
   * @param {string} userId - User ID
   * @param {Object} settings - Settings to update
   * @returns {Promise<Object>} Updated settings
   */
  static async updatePrivacySettings(userId, settings) {
    const { data, error } = await supabaseAdmin
      .from('user_settings')
      .upsert({
        user_id: userId,
        ...settings,
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  }
}
