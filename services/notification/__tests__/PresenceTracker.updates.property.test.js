import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import PresenceTracker from '../PresenceTracker.js';
import Redis from 'ioredis';

/**
 * Property-Based Tests for PresenceTracker Updates
 * Feature: production-notification-system
 * 
 * These tests validate presence update properties including disconnect,
 * active chat updates, heartbeat updates, and reconnection.
 */

describe('PresenceTracker Updates - Property-Based Tests', () => {
  let presenceTracker;
  let redis;

  beforeEach(async () => {
    // Create Redis client for testing
    redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      db: 1, // Use separate database for testing
    });

    // Clear test database
    await redis.flushdb();

    presenceTracker = new PresenceTracker(redis);
  });

  afterEach(async () => {
    await presenceTracker.close();
    await redis.quit();
  });

  /**
   * Property 5: Presence State Update on Disconnect
   * 
   * For any user socket disconnection, the presence state SHALL be updated 
   * to reflect the disconnection within 1 second of the disconnect event.
   * 
   * Validates: Requirements 2.3
   */
  test('Property 5: Presence updates within 1 second of disconnect', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        async (userId, socketId, deviceId) => {
          // Set user online
          await presenceTracker.setOnline(userId, socketId, deviceId);

          // Record time before disconnect
          const beforeDisconnect = Date.now();

          // Disconnect user
          await presenceTracker.setOffline(userId, socketId);

          // Record time after disconnect
          const afterDisconnect = Date.now();

          // Get updated presence
          const presence = await presenceTracker.getPresence(userId);

          // Verify disconnect was processed within 1 second
          const processingTime = afterDisconnect - beforeDisconnect;
          expect(processingTime).toBeLessThan(1000);

          // Verify device is marked offline
          const device = presence.devices.find(d => d.socketId === socketId);
          expect(device.status).toBe('OFFLINE');
          expect(device.activeChatId).toBeNull();
        }
      ),
      { numRuns: 30 }
    );
  });

  /**
   * Property 9: Active Chat Update
   * 
   * For any user opening a specific chat, the activeChatId field in presence 
   * data SHALL be updated to match the opened chat's conversation ID.
   * 
   * Validates: Requirements 2.8
   */
  test('Property 9: Active chat ID updates when user opens chat', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        async (userId, socketId, deviceId, conversationId) => {
          // Set user online
          await presenceTracker.setOnline(userId, socketId, deviceId);

          // Set active chat
          await presenceTracker.setActiveChat(userId, conversationId);

          // Get updated presence
          const presence = await presenceTracker.getPresence(userId);

          // Verify activeChatId is updated for online devices
          const onlineDevices = presence.devices.filter(d => d.status === 'ONLINE');
          expect(onlineDevices.length).toBeGreaterThan(0);
          
          onlineDevices.forEach(device => {
            expect(device.activeChatId).toBe(conversationId);
          });
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 45: Heartbeat Updates Last Seen
   * 
   * For any heartbeat signal received from a user, the system SHALL update 
   * the lastSeen timestamp in presence data to the current time.
   * 
   * Validates: Requirements 9.2
   */
  test('Property 45: Heartbeat updates lastSeen timestamp', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        async (userId, socketId, deviceId) => {
          // Set user online
          await presenceTracker.setOnline(userId, socketId, deviceId);

          // Get initial presence
          const initialPresence = await presenceTracker.getPresence(userId);
          const initialLastSeen = new Date(initialPresence.lastSeen).getTime();

          // Wait a small amount of time
          await new Promise(resolve => setTimeout(resolve, 100));

          // Send heartbeat
          await presenceTracker.heartbeat(userId, socketId);

          // Get updated presence
          const updatedPresence = await presenceTracker.getPresence(userId);
          const updatedLastSeen = new Date(updatedPresence.lastSeen).getTime();

          // Verify lastSeen was updated
          expect(updatedLastSeen).toBeGreaterThan(initialLastSeen);

          // Verify device's lastHeartbeat was updated
          const device = updatedPresence.devices.find(d => d.socketId === socketId);
          const deviceLastHeartbeat = new Date(device.lastHeartbeat).getTime();
          expect(deviceLastHeartbeat).toBeGreaterThan(initialLastSeen);
        }
      ),
      { numRuns: 30 }
    );
  });

  /**
   * Property 46: Reconnection State Restoration
   * 
   * For any user reconnecting after being marked OFFLINE, the system SHALL 
   * transition the presence state back to ONLINE.
   * 
   * Validates: Requirements 9.4
   */
  test('Property 46: Reconnection restores ONLINE state', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        async (userId, socketId, deviceId) => {
          // Set user online
          await presenceTracker.setOnline(userId, socketId, deviceId);

          // Disconnect user
          await presenceTracker.setOffline(userId, socketId);

          // Verify user is offline
          const offlinePresence = await presenceTracker.getPresence(userId);
          expect(offlinePresence.status).toBe('OFFLINE');

          // Reconnect user with new socket ID
          const newSocketId = `${socketId}-reconnect`;
          await presenceTracker.setOnline(userId, newSocketId, deviceId);

          // Verify user is back online
          const onlinePresence = await presenceTracker.getPresence(userId);
          expect(onlinePresence.status).toBe('ONLINE');

          // Verify new device entry exists
          const reconnectedDevice = onlinePresence.devices.find(
            d => d.socketId === newSocketId
          );
          expect(reconnectedDevice).toBeDefined();
          expect(reconnectedDevice.status).toBe('ONLINE');
        }
      ),
      { numRuns: 30 }
    );
  });

  /**
   * Additional test: Clear active chat
   */
  test('Property 9 Extension: Active chat can be cleared by setting to null', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        async (userId, socketId, deviceId, conversationId) => {
          // Set user online
          await presenceTracker.setOnline(userId, socketId, deviceId);

          // Set active chat
          await presenceTracker.setActiveChat(userId, conversationId);

          // Verify chat is set
          let presence = await presenceTracker.getPresence(userId);
          const device = presence.devices.find(d => d.socketId === socketId);
          expect(device.activeChatId).toBe(conversationId);

          // Clear active chat
          await presenceTracker.setActiveChat(userId, null);

          // Verify chat is cleared
          presence = await presenceTracker.getPresence(userId);
          const updatedDevice = presence.devices.find(d => d.socketId === socketId);
          expect(updatedDevice.activeChatId).toBeNull();
        }
      ),
      { numRuns: 30 }
    );
  });

  /**
   * Additional test: hasActiveChatOpen utility
   */
  test('hasActiveChatOpen returns true when user has chat open', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        async (userId, socketId, deviceId, conversationId) => {
          // Set user online
          await presenceTracker.setOnline(userId, socketId, deviceId);

          // Set active chat
          await presenceTracker.setActiveChat(userId, conversationId);

          // Check if chat is open
          const hasChatOpen = await presenceTracker.hasActiveChatOpen(userId, conversationId);
          expect(hasChatOpen).toBe(true);

          // Check different conversation
          const differentConversationId = `${conversationId}-different`;
          const hasDifferentChatOpen = await presenceTracker.hasActiveChatOpen(
            userId,
            differentConversationId
          );
          expect(hasDifferentChatOpen).toBe(false);
        }
      ),
      { numRuns: 30 }
    );
  });
});
