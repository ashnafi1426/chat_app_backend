import Redis from 'ioredis';

/**
 * PresenceTracker Service
 * 
 * Manages real-time user presence state in Redis with multi-device support.
 * Tracks online/offline status, active chat contexts, and heartbeat signals.
 */
class PresenceTracker {
  constructor(redisClient) {
    this.redis = redisClient || new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      }
    });

    this.PRESENCE_TTL = 86400; // 24 hours in seconds
    this.HEARTBEAT_TIMEOUT = 30000; // 30 seconds in milliseconds
  }

  /**
   * Generate Redis key for user presence
   * @param {string} userId - User ID
   * @returns {string} Redis key formatted as presence:{userId}
   */
  _getPresenceKey(userId) {
    return `presence:${userId}`;
  }

  /**
   * Set user as online when socket connects
   * @param {string} userId - User ID
   * @param {string} socketId - Socket connection ID
   * @param {string} deviceId - Device identifier
   * @returns {Promise<void>}
   */
  async setOnline(userId, socketId, deviceId) {
    const key = this._getPresenceKey(userId);
    const now = new Date().toISOString();

    // Get existing presence data
    const existingData = await this.redis.get(key);
    let presenceData;

    if (existingData) {
      presenceData = JSON.parse(existingData);
    } else {
      presenceData = {
        status: 'ONLINE',
        devices: [],
        lastSeen: now
      };
    }

    // Check if device already exists
    const deviceIndex = presenceData.devices.findIndex(d => d.deviceId === deviceId);
    
    const devicePresence = {
      socketId,
      deviceId,
      status: 'ONLINE',
      activeChatId: null,
      lastHeartbeat: now
    };

    if (deviceIndex >= 0) {
      // Update existing device
      presenceData.devices[deviceIndex] = devicePresence;
    } else {
      // Add new device
      presenceData.devices.push(devicePresence);
    }

    // Update overall status to ONLINE if any device is online
    presenceData.status = 'ONLINE';
    presenceData.lastSeen = now;

    // Save to Redis with TTL
    await this.redis.setex(key, this.PRESENCE_TTL, JSON.stringify(presenceData));
  }

  /**
   * Set user as offline when socket disconnects
   * @param {string} userId - User ID
   * @param {string} socketId - Socket connection ID
   * @returns {Promise<void>}
   */
  async setOffline(userId, socketId) {
    const key = this._getPresenceKey(userId);
    const now = new Date().toISOString();

    // Get existing presence data
    const existingData = await this.redis.get(key);
    if (!existingData) {
      return; // No presence data to update
    }

    const presenceData = JSON.parse(existingData);

    // Find and update the device with matching socketId
    const deviceIndex = presenceData.devices.findIndex(d => d.socketId === socketId);
    
    if (deviceIndex >= 0) {
      presenceData.devices[deviceIndex].status = 'OFFLINE';
      presenceData.devices[deviceIndex].activeChatId = null;
      presenceData.lastSeen = now;
    }

    // Update overall status - ONLINE if any device is still online
    const hasOnlineDevice = presenceData.devices.some(d => d.status === 'ONLINE');
    presenceData.status = hasOnlineDevice ? 'ONLINE' : 'OFFLINE';

    // Save updated data with TTL
    await this.redis.setex(key, this.PRESENCE_TTL, JSON.stringify(presenceData));
  }

  /**
   * Update active chat context for a user
   * @param {string} userId - User ID
   * @param {string|null} conversationId - Conversation ID or null to clear
   * @returns {Promise<void>}
   */
  async setActiveChat(userId, conversationId) {
    const key = this._getPresenceKey(userId);
    const now = new Date().toISOString();

    // Get existing presence data
    const existingData = await this.redis.get(key);
    if (!existingData) {
      return; // No presence data to update
    }

    const presenceData = JSON.parse(existingData);

    // Update activeChatId for all online devices
    // In a real implementation, you might want to track which device made the request
    presenceData.devices.forEach(device => {
      if (device.status === 'ONLINE') {
        device.activeChatId = conversationId;
      }
    });

    presenceData.lastSeen = now;

    // Save updated data with TTL
    await this.redis.setex(key, this.PRESENCE_TTL, JSON.stringify(presenceData));
  }

  /**
   * Process heartbeat signal from client
   * @param {string} userId - User ID
   * @param {string} socketId - Socket connection ID
   * @returns {Promise<void>}
   */
  async heartbeat(userId, socketId) {
    const key = this._getPresenceKey(userId);
    const now = new Date().toISOString();

    // Get existing presence data
    const existingData = await this.redis.get(key);
    if (!existingData) {
      return; // No presence data to update
    }

    const presenceData = JSON.parse(existingData);

    // Find and update the device with matching socketId
    const device = presenceData.devices.find(d => d.socketId === socketId);
    
    if (device) {
      device.lastHeartbeat = now;
      presenceData.lastSeen = now;

      // Save updated data with TTL
      await this.redis.setex(key, this.PRESENCE_TTL, JSON.stringify(presenceData));
    }
  }

  /**
   * Get current presence state for a user
   * @param {string} userId - User ID
   * @returns {Promise<Object|null>} Presence state or null if not found
   */
  async getPresence(userId) {
    const key = this._getPresenceKey(userId);
    const data = await this.redis.get(key);
    
    if (!data) {
      return null;
    }

    return JSON.parse(data);
  }

  /**
   * Check if user has a specific chat open
   * @param {string} userId - User ID
   * @param {string} conversationId - Conversation ID to check
   * @returns {Promise<boolean>} True if user has the chat open on any device
   */
  async hasActiveChatOpen(userId, conversationId) {
    const presence = await this.getPresence(userId);
    
    if (!presence) {
      return false;
    }

    // Check if any online device has this chat open
    return presence.devices.some(
      device => device.status === 'ONLINE' && device.activeChatId === conversationId
    );
  }

  /**
   * Cleanup stale presence data
   * This method is called by a background job
   * Redis TTL handles automatic expiration, but this can be used for manual cleanup
   * @returns {Promise<number>} Number of keys cleaned up
   */
  async cleanupStalePresence() {
    // Redis TTL automatically handles cleanup after 24 hours
    // This method can be used for additional cleanup logic if needed
    // For now, it's a placeholder that returns 0
    return 0;
  }

  /**
   * Check for timed-out heartbeats and mark devices as offline
   * This should be called by a background job every 10 seconds
   * @returns {Promise<number>} Number of devices marked as offline
   */
  async checkHeartbeatTimeouts() {
    let devicesMarkedOffline = 0;
    const now = Date.now();

    // Get all presence keys
    const keys = await this.redis.keys('presence:*');

    for (const key of keys) {
      const data = await this.redis.get(key);
      if (!data) continue;

      const presenceData = JSON.parse(data);
      let updated = false;

      // Check each device for timeout
      for (const device of presenceData.devices) {
        if (device.status === 'ONLINE') {
          const lastHeartbeat = new Date(device.lastHeartbeat).getTime();
          const timeSinceHeartbeat = now - lastHeartbeat;

          if (timeSinceHeartbeat > this.HEARTBEAT_TIMEOUT) {
            device.status = 'OFFLINE';
            device.activeChatId = null;
            updated = true;
            devicesMarkedOffline++;
          }
        }
      }

      if (updated) {
        // Update overall status
        const hasOnlineDevice = presenceData.devices.some(d => d.status === 'ONLINE');
        presenceData.status = hasOnlineDevice ? 'ONLINE' : 'OFFLINE';
        presenceData.lastSeen = new Date().toISOString();

        // Save updated data
        await this.redis.setex(key, this.PRESENCE_TTL, JSON.stringify(presenceData));
      }
    }

    return devicesMarkedOffline;
  }

  /**
   * Close Redis connection
   * @returns {Promise<void>}
   */
  async close() {
    await this.redis.quit();
  }
}

export default PresenceTracker;
