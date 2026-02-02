import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import fc from 'fast-check';
import PresenceTracker from '../PresenceTracker.js';
import Redis from 'ioredis';

/**
 * Property-Based Tests for PresenceTracker Heartbeat Mechanism
 * Feature: production-notification-system
 * 
 * These tests validate heartbeat timeout and device-specific timeout properties.
 */

describe('PresenceTracker Heartbeat - Property-Based Tests', () => {
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
   * Property 6: Heartbeat Timeout Transition
   * 
   * For any connected user whose heartbeat is not received within 30 seconds,
   * the presence state SHALL transition to OFFLINE.
   * 
   * Validates: Requirements 2.5, 9.3
   */
  test('Property 6: User transitions to OFFLINE after heartbeat timeout', async () => {
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
          expect(initialPresence.status).toBe('ONLINE');
          expect(initialPresence.devices[0].status).toBe('ONLINE');

          // Manually set lastHeartbeat to 31 seconds ago
          const key = `presence:${userId}`;
          const presenceData = JSON.parse(await redis.get(key));
          const oldTimestamp = new Date(Date.now() - 31000).toISOString();
          presenceData.devices[0].lastHeartbeat = oldTimestamp;
          await redis.setex(key, 86400, JSON.stringify(presenceData));

          // Run heartbeat timeout check
          const markedOffline = await presenceTracker.checkHeartbeatTimeouts();

          // Verify device was marked offline
          expect(markedOffline).toBeGreaterThan(0);

          // Get updated presence
          const updatedPresence = await presenceTracker.getPresence(userId);
          expect(updatedPresence.status).toBe('OFFLINE');
          expect(updatedPresence.devices[0].status).toBe('OFFLINE');
          expect(updatedPresence.devices[0].activeChatId).toBeNull();
        }
      ),
      { numRuns: 30 }
    );
  });

  /**
   * Property 48: Device-Specific Timeout
   * 
   * For any device whose heartbeat times out, the system SHALL mark only 
   * that specific device as disconnected without affecting other devices 
   * of the same user.
   * 
   * Validates: Requirements 9.6
   */
  test('Property 48: Device-specific timeout does not affect other devices', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.array(
          fc.record({
            socketId: fc.uuid(),
            deviceId: fc.uuid(),
          }),
          { minLength: 2, maxLength: 4 }
        ),
        async (userId, devices) => {
          // Connect multiple devices
          for (const device of devices) {
            await presenceTracker.setOnline(userId, device.socketId, device.deviceId);
          }

          // Verify all devices are online
          const initialPresence = await presenceTracker.getPresence(userId);
          expect(initialPresence.devices.length).toBe(devices.length);
          expect(initialPresence.status).toBe('ONLINE');

          // Manually set first device's lastHeartbeat to 31 seconds ago
          const key = `presence:${userId}`;
          const presenceData = JSON.parse(await redis.get(key));
          const oldTimestamp = new Date(Date.now() - 31000).toISOString();
          presenceData.devices[0].lastHeartbeat = oldTimestamp;
          await redis.setex(key, 86400, JSON.stringify(presenceData));

          // Run heartbeat timeout check
          await presenceTracker.checkHeartbeatTimeouts();

          // Get updated presence
          const updatedPresence = await presenceTracker.getPresence(userId);

          // First device should be offline
          expect(updatedPresence.devices[0].status).toBe('OFFLINE');

          // Other devices should still be online
          for (let i = 1; i < devices.length; i++) {
            expect(updatedPresence.devices[i].status).toBe('ONLINE');
          }

          // Overall status should still be ONLINE (at least one device is online)
          expect(updatedPresence.status).toBe('ONLINE');
        }
      ),
      { numRuns: 30 }
    );
  });

  /**
   * Additional test: All devices timeout results in OFFLINE status
   */
  test('Property 48 Extension: All devices timeout results in OFFLINE user status', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.array(
          fc.record({
            socketId: fc.uuid(),
            deviceId: fc.uuid(),
          }),
          { minLength: 2, maxLength: 3 }
        ),
        async (userId, devices) => {
          // Connect multiple devices
          for (const device of devices) {
            await presenceTracker.setOnline(userId, device.socketId, device.deviceId);
          }

          // Manually set all devices' lastHeartbeat to 31 seconds ago
          const key = `presence:${userId}`;
          const presenceData = JSON.parse(await redis.get(key));
          const oldTimestamp = new Date(Date.now() - 31000).toISOString();
          presenceData.devices.forEach(device => {
            device.lastHeartbeat = oldTimestamp;
          });
          await redis.setex(key, 86400, JSON.stringify(presenceData));

          // Run heartbeat timeout check
          await presenceTracker.checkHeartbeatTimeouts();

          // Get updated presence
          const updatedPresence = await presenceTracker.getPresence(userId);

          // All devices should be offline
          updatedPresence.devices.forEach(device => {
            expect(device.status).toBe('OFFLINE');
          });

          // Overall status should be OFFLINE
          expect(updatedPresence.status).toBe('OFFLINE');
        }
      ),
      { numRuns: 30 }
    );
  });
});
