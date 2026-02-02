import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import PresenceTracker from '../PresenceTracker.js';
import Redis from 'ioredis';

/**
 * Property-Based Tests for PresenceTracker
 * Feature: production-notification-system
 * 
 * These tests validate universal properties that should hold true
 * across all valid executions of the presence tracking system.
 */

describe('PresenceTracker - Property-Based Tests', () => {
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
   * Property 3: Presence Key Format Consistency
   * 
   * For any user presence data stored in Redis, the key SHALL be 
   * formatted as `presence:{userId}` where userId is the user's unique identifier.
   * 
   * Validates: Requirements 2.1
   */
  test('Property 3: Presence key format is always presence:{userId}', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        async (userId, socketId, deviceId) => {
          // Set user online
          await presenceTracker.setOnline(userId, socketId, deviceId);

          // Check that the key exists with correct format
          const expectedKey = `presence:${userId}`;
          const exists = await redis.exists(expectedKey);
          
          expect(exists).toBe(1);

          // Verify no other keys were created
          const allKeys = await redis.keys('presence:*');
          expect(allKeys).toContain(expectedKey);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 4: Presence Data Completeness on Connect
   * 
   * For any user socket connection, the stored presence data SHALL include 
   * all required fields: status, activeChatId, socketId, lastSeen, and devices array.
   * 
   * Validates: Requirements 2.2
   */
  test('Property 4: Presence data includes all required fields on connect', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        async (userId, socketId, deviceId) => {
          // Set user online
          await presenceTracker.setOnline(userId, socketId, deviceId);

          // Get presence data
          const presence = await presenceTracker.getPresence(userId);

          // Verify all required fields exist
          expect(presence).toBeDefined();
          expect(presence).toHaveProperty('status');
          expect(presence).toHaveProperty('devices');
          expect(presence).toHaveProperty('lastSeen');
          expect(Array.isArray(presence.devices)).toBe(true);
          expect(presence.devices.length).toBeGreaterThan(0);

          // Verify device data completeness
          const device = presence.devices[0];
          expect(device).toHaveProperty('socketId');
          expect(device).toHaveProperty('deviceId');
          expect(device).toHaveProperty('status');
          expect(device).toHaveProperty('activeChatId');
          expect(device).toHaveProperty('lastHeartbeat');

          // Verify values
          expect(device.socketId).toBe(socketId);
          expect(device.deviceId).toBe(deviceId);
          expect(device.status).toBe('ONLINE');
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 7: Multi-Device Presence Support
   * 
   * For any user with multiple connected devices, the presence data SHALL 
   * maintain separate entries in the devices array for each device with 
   * independent status tracking.
   * 
   * Validates: Requirements 2.6
   */
  test('Property 7: Multi-device presence maintains separate device entries', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.array(
          fc.record({
            socketId: fc.uuid(),
            deviceId: fc.uuid(),
          }),
          { minLength: 2, maxLength: 5 }
        ),
        async (userId, devices) => {
          // Connect multiple devices
          for (const device of devices) {
            await presenceTracker.setOnline(userId, device.socketId, device.deviceId);
          }

          // Get presence data
          const presence = await presenceTracker.getPresence(userId);

          // Verify all devices are tracked
          expect(presence.devices.length).toBe(devices.length);

          // Verify each device has independent entry
          for (const device of devices) {
            const foundDevice = presence.devices.find(
              d => d.socketId === device.socketId && d.deviceId === device.deviceId
            );
            expect(foundDevice).toBeDefined();
            expect(foundDevice.status).toBe('ONLINE');
          }

          // Verify devices are independent - disconnect one
          await presenceTracker.setOffline(userId, devices[0].socketId);
          const updatedPresence = await presenceTracker.getPresence(userId);

          // First device should be offline
          const firstDevice = updatedPresence.devices.find(
            d => d.socketId === devices[0].socketId
          );
          expect(firstDevice.status).toBe('OFFLINE');

          // Other devices should still be online
          for (let i = 1; i < devices.length; i++) {
            const otherDevice = updatedPresence.devices.find(
              d => d.socketId === devices[i].socketId
            );
            expect(otherDevice.status).toBe('ONLINE');
          }
        }
      ),
      { numRuns: 30 }
    );
  });
});
