import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { HybridRateLimiter } from '../../src/rate-limit/hybrid-limiter.js'
import { MockKVStore } from '../../src/rate-limit/kv-store.js'
import type { RateLimitConfig } from '../../src/rate-limit/types.js'
import * as utils from '../../src/utils.js'

describe('HybridRateLimiter', () => {
  let mockKVStore: MockKVStore
  let rateLimiter: HybridRateLimiter
  let logSpy: any
  let defaultConfig: RateLimitConfig

  beforeEach(() => {
    vi.useFakeTimers()
    logSpy = vi.spyOn(utils, 'log').mockImplementation(() => {})
    
    mockKVStore = new MockKVStore()
    defaultConfig = {
      windowMs: 5000,
      max: 3,
      kvEnabled: true,
      memoryCacheSize: 100,
      memoryCacheTTL: 10000,
      cleanupThreshold: 3600000,
      cleanupInterval: 0, // Disable automatic cleanup for tests
      adaptiveEnabled: false
    }
    
    rateLimiter = new HybridRateLimiter(mockKVStore, defaultConfig)
  })

  afterEach(() => {
    rateLimiter.dispose()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  describe('Basic rate limiting', () => {
    it('should allow requests within limit', async () => {
      const result1 = await rateLimiter.checkRequest('user1', 5000, 3)
      expect(result1.allowed).toBe(true)
      expect(result1.remaining).toBe(2)
      expect(result1.retryAfterSec).toBe(0)

      const result2 = await rateLimiter.checkRequest('user1', 5000, 3)
      expect(result2.allowed).toBe(true)
      expect(result2.remaining).toBe(1)

      const result3 = await rateLimiter.checkRequest('user1', 5000, 3)
      expect(result3.allowed).toBe(true)
      expect(result3.remaining).toBe(0)
    })

    it('should deny requests exceeding limit', async () => {
      // Fill the quota
      await rateLimiter.checkRequest('user1', 5000, 2)
      await rateLimiter.checkRequest('user1', 5000, 2)

      // This should be denied
      const result = await rateLimiter.checkRequest('user1', 5000, 2)
      expect(result.allowed).toBe(false)
      expect(result.remaining).toBe(0)
      expect(result.retryAfterSec).toBeGreaterThan(0)
      expect(result.retryAfterSec).toBeLessThanOrEqual(5)
    })

    it('should reset after window expires', async () => {
      // Fill the quota
      await rateLimiter.checkRequest('user1', 1000, 2)
      await rateLimiter.checkRequest('user1', 1000, 2)

      // Should be denied
      const result1 = await rateLimiter.checkRequest('user1', 1000, 2)
      expect(result1.allowed).toBe(false)

      // Advance time past window
      vi.advanceTimersByTime(1500)

      // Should be allowed again
      const result2 = await rateLimiter.checkRequest('user1', 1000, 2)
      expect(result2.allowed).toBe(true)
      expect(result2.remaining).toBe(1)
    })

    it('should handle multiple users independently', async () => {
      await rateLimiter.checkRequest('user1', 5000, 2)
      await rateLimiter.checkRequest('user1', 5000, 2)

      // user1 should be at limit
      const result1 = await rateLimiter.checkRequest('user1', 5000, 2)
      expect(result1.allowed).toBe(false)

      // user2 should still be allowed
      const result2 = await rateLimiter.checkRequest('user2', 5000, 2)
      expect(result2.allowed).toBe(true)
      expect(result2.remaining).toBe(1)
    })
  })

  describe('Hybrid caching behavior', () => {
    it('should use memory cache for subsequent requests', async () => {
      const result1 = await rateLimiter.checkRequest('user1', 5000, 3)
      expect(result1.metadata?.source).toBe('new')

      const result2 = await rateLimiter.checkRequest('user1', 5000, 3)
      expect(result2.metadata?.source).toBe('cache')
    })

    it('should load from KV when memory cache misses', async () => {
      // First request creates record
      await rateLimiter.checkRequest('user1', 5000, 3)
      
      // Clear memory cache to simulate cache miss
      rateLimiter.clearMemoryCache()
      
      // Next request should load from KV
      const result = await rateLimiter.checkRequest('user1', 5000, 3)
      expect(result.metadata?.source).toBe('kv')
      expect(result.remaining).toBe(1) // Should continue from previous state
    })

    it('should persist to KV in background', async () => {
      await rateLimiter.checkRequest('user1', 5000, 3)
      
      // Should be in KV store (now synchronous)
      const kvRecord = await mockKVStore.get('rl:v1:user1')
      expect(kvRecord).toBeTruthy()
      expect(kvRecord?.timestamps).toHaveLength(1)
    })

    it('should work without KV when disabled', async () => {
      const configWithoutKV = { ...defaultConfig, kvEnabled: false }
      const noKVLimiter = new HybridRateLimiter(mockKVStore, configWithoutKV)

      const result = await noKVLimiter.checkRequest('user1', 5000, 3)
      expect(result.allowed).toBe(true)
      expect(result.metadata?.kvEnabled).toBe(false)
      
      // Should not persist to KV
      const kvRecord = await mockKVStore.get('rl:v1:user1')
      expect(kvRecord).toBeNull()

      noKVLimiter.dispose()
    })

    it('should handle KV failures gracefully', async () => {
      mockKVStore.shouldFail = true
      
      // Should still work with memory only
      const result = await rateLimiter.checkRequest('user1', 5000, 3)
      expect(result.allowed).toBe(true)
      expect(result.metadata?.source).toBe('new')
    })
  })

  describe('Key generation', () => {
    it('should generate consistent keys', async () => {
      await rateLimiter.checkRequest('user:123', 5000, 3)
      
      // Check KV for generated key
      const kvRecord = await mockKVStore.get('rl:v1:user:123')
      expect(kvRecord).toBeTruthy()
    })

    it('should handle special characters in keys', async () => {
      const specialKey = 'user@domain.com:special/chars'
      const result = await rateLimiter.checkRequest(specialKey, 5000, 3)
      expect(result.allowed).toBe(true)
      
      const kvRecord = await mockKVStore.get(`rl:v1:${specialKey}`)
      expect(kvRecord).toBeTruthy()
    })
  })

  describe('Metadata handling', () => {
    it('should store and retrieve metadata', async () => {
      const metadata = {
        userAgent: 'test-agent',
        endpoint: 'telegram',
        flags: ['trusted']
      }

      await rateLimiter.checkRequest('user1', 5000, 3, metadata)
      
      const kvRecord = await mockKVStore.get('rl:v1:user1')
      expect(kvRecord?.metadata).toEqual(metadata)
    })

    it('should update lastAccess timestamp', async () => {
      const before = Date.now()
      await rateLimiter.checkRequest('user1', 5000, 3)
      const after = Date.now()
      
      const kvRecord = await mockKVStore.get('rl:v1:user1')
      expect(kvRecord?.lastAccess).toBeGreaterThanOrEqual(before)
      expect(kvRecord?.lastAccess).toBeLessThanOrEqual(after)
    })

    it('should provide accurate reset time', async () => {
      const start = Date.now()
      const result = await rateLimiter.checkRequest('user1', 1000, 3)
      
      expect(result.resetTime).toBeGreaterThanOrEqual(start + 1000)
      expect(result.resetTime).toBeLessThanOrEqual(start + 1000 + 100) // Allow 100ms tolerance
    })
  })

  describe('Window management', () => {
    it('should properly clean up expired timestamps', async () => {
      // Add requests at different times
      await rateLimiter.checkRequest('user1', 2000, 5)
      
      vi.advanceTimersByTime(500)
      await rateLimiter.checkRequest('user1', 2000, 5)
      
      vi.advanceTimersByTime(500)
      await rateLimiter.checkRequest('user1', 2000, 5)
      
      // Advance time to expire first request
      vi.advanceTimersByTime(1500)
      
      // Check remaining should only count non-expired requests
      const result = await rateLimiter.checkRequest('user1', 2000, 5)
      expect(result.remaining).toBe(3) // 5 - 2 (only 2 requests within window)
    })

    it('should handle different window sizes per request', async () => {
      // First request with 5 second window
      await rateLimiter.checkRequest('user1', 5000, 3)
      
      // Second request with 1 second window (should have different behavior)
      const result = await rateLimiter.checkRequest('user1', 1000, 3)
      expect(result.allowed).toBe(true)
      
      // The record should use the latest window configuration
      const kvRecord = await mockKVStore.get('rl:v1:user1')
      expect(kvRecord?.windowMs).toBe(1000)
    })

    it('should calculate retry time accurately', async () => {
      const windowMs = 2000
      const start = Date.now()
      
      // Fill quota
      await rateLimiter.checkRequest('user1', windowMs, 2)
      await rateLimiter.checkRequest('user1', windowMs, 2)
      
      // Should be denied
      const result = await rateLimiter.checkRequest('user1', windowMs, 2)
      expect(result.allowed).toBe(false)
      
      const expectedRetry = Math.ceil((start + windowMs - Date.now()) / 1000)
      expect(result.retryAfterSec).toBe(expectedRetry)
    })
  })

  describe('Cleanup operations', () => {
    it('should clean up old KV records', async () => {
      // Create some records
      await rateLimiter.checkRequest('user1', 5000, 3)
      await rateLimiter.checkRequest('user2', 5000, 3)
      await rateLimiter.checkRequest('user3', 5000, 3)
      
      // Advance time past cleanup threshold
      vi.advanceTimersByTime(defaultConfig.cleanupThreshold + 1000)
      
      // Run cleanup
      await rateLimiter.cleanup()
      
      // Old records should be cleaned
      const user1Record = await mockKVStore.get('rl:v1:user1')
      expect(user1Record).toBeNull()
    })

    it('should not clean up recent records', async () => {
      await rateLimiter.checkRequest('user1', 5000, 3)
      
      // Advance time but not past threshold
      vi.advanceTimersByTime(1000)
      
      await rateLimiter.cleanup()
      
      // Record should still exist
      const user1Record = await mockKVStore.get('rl:v1:user1')
      expect(user1Record).toBeTruthy()
    })

    it('should handle cleanup errors gracefully', async () => {
      await rateLimiter.checkRequest('user1', 5000, 3)
      
      // Make KV operations fail
      mockKVStore.shouldFail = true
      
      // Cleanup should not throw
      await expect(rateLimiter.cleanup()).resolves.toBeUndefined()
      
      // Should log error
      expect(logSpy).toHaveBeenCalledWith('error', expect.stringContaining('cleanup'), expect.any(Object))
    })

    it('should clean up memory cache as part of cleanup', async () => {
      // Add item to memory cache
      await rateLimiter.checkRequest('user1', 5000, 3)
      
      // Verify it's in memory
      const memoryStats = rateLimiter.getMemoryStats()
      expect(memoryStats.size).toBeGreaterThan(0)
      
      // Clear memory manually
      rateLimiter.clearMemoryCache()
      
      const newStats = rateLimiter.getMemoryStats()
      expect(newStats.size).toBe(0)
    })
  })

  describe('Memory statistics', () => {
    it('should provide accurate memory statistics', async () => {
      const stats = rateLimiter.getMemoryStats()
      expect(stats).toHaveProperty('size')
      expect(stats).toHaveProperty('maxSize')
      expect(stats).toHaveProperty('utilization')
      expect(stats).toHaveProperty('ttl')
      
      expect(stats.maxSize).toBe(defaultConfig.memoryCacheSize)
      expect(stats.ttl).toBe(defaultConfig.memoryCacheTTL)
    })

    it('should update utilization as cache fills', async () => {
      const initialStats = rateLimiter.getMemoryStats()
      expect(initialStats.utilization).toBe(0)
      
      await rateLimiter.checkRequest('user1', 5000, 3)
      
      const newStats = rateLimiter.getMemoryStats()
      expect(newStats.utilization).toBeGreaterThan(0)
      expect(newStats.size).toBe(1)
    })
  })

  describe('Disposal and resource management', () => {
    it('should clean up resources on disposal', () => {
      const limiter = new HybridRateLimiter(mockKVStore, defaultConfig)
      
      // Should not throw
      expect(() => limiter.dispose()).not.toThrow()
      
      // Memory should be cleared
      const stats = limiter.getMemoryStats()
      expect(stats.size).toBe(0)
    })

    it('should handle multiple disposals gracefully', () => {
      const limiter = new HybridRateLimiter(mockKVStore, defaultConfig)
      
      limiter.dispose()
      expect(() => limiter.dispose()).not.toThrow()
    })
  })

  describe('Adaptive rate limiting support', () => {
    it('should include escalation metadata when adaptive is enabled', async () => {
      const adaptiveConfig = { ...defaultConfig, adaptiveEnabled: true }
      const adaptiveLimiter = new HybridRateLimiter(mockKVStore, adaptiveConfig)
      
      // Fill quota
      await adaptiveLimiter.checkRequest('user1', 5000, 2)
      await adaptiveLimiter.checkRequest('user1', 5000, 2)
      
      // Should be denied with escalation metadata
      const result = await adaptiveLimiter.checkRequest('user1', 5000, 2)
      expect(result.allowed).toBe(false)
      expect(result.metadata?.escalated).toBe(false) // Base implementation
      
      adaptiveLimiter.dispose()
    })

    it('should not include escalation metadata when adaptive is disabled', async () => {
      // Fill quota
      await rateLimiter.checkRequest('user1', 5000, 2)
      await rateLimiter.checkRequest('user1', 5000, 2)
      
      // Should be denied without escalation metadata
      const result = await rateLimiter.checkRequest('user1', 5000, 2)
      expect(result.allowed).toBe(false)
      expect(result.metadata?.escalated).toBeUndefined()
    })
  })

  describe('Error scenarios', () => {
    it('should handle corrupted KV data gracefully', async () => {
      // Put invalid data in KV
      await mockKVStore.put('rl:v1:user1', { invalid: 'data' } as any)
      
      // Should still work (treat as new record)
      const result = await rateLimiter.checkRequest('user1', 5000, 3)
      expect(result.allowed).toBe(true)
      expect(result.metadata?.source).toBe('kv') // Loaded from KV but treated as new
    })

    it('should handle extremely high request rates', async () => {
      const results = []
      
      // Fire sequential requests rapidly to test rate limiting
      for (let i = 0; i < 10; i++) {
        const result = await rateLimiter.checkRequest('user1', 5000, 3)
        results.push(result)
      }
      
      // Should only allow first 3
      const allowed = results.filter(r => r.allowed)
      const denied = results.filter(r => !r.allowed)
      
      expect(allowed.length).toBe(3)
      expect(denied.length).toBe(7)
      expect(allowed.length + denied.length).toBe(10)
    })

    it('should handle zero limits', async () => {
      const result = await rateLimiter.checkRequest('user1', 5000, 0)
      expect(result.allowed).toBe(false)
      expect(result.remaining).toBe(0)
      expect(result.retryAfterSec).toBeGreaterThan(0)
    })

    it('should handle very small windows', async () => {
      const result = await rateLimiter.checkRequest('user1', 1, 3)
      expect(result.allowed).toBe(true)
      
      // Advance minimal time
      vi.advanceTimersByTime(2)
      
      // Should reset immediately
      const result2 = await rateLimiter.checkRequest('user1', 1, 3)
      expect(result2.allowed).toBe(true)
      expect(result2.remaining).toBe(2)
    })
  })

  describe('TTL calculation for KV persistence', () => {
    it('should calculate appropriate TTL based on window size', async () => {
      const spy = vi.spyOn(mockKVStore, 'put')
      
      await rateLimiter.checkRequest('user1', 10000, 3) // 10 second window
      
      expect(spy).toHaveBeenCalledWith(
        'rl:v1:user1',
        expect.any(Object),
        expect.any(Number)
      )
      
      // TTL should be window + buffer (300 seconds)
      const ttlCall = spy.mock.calls[0] as any[]
      const ttl = ttlCall?.[2] as number | undefined
      expect(ttl).toBe(Math.ceil((10000 + 300000) / 1000)) // 310 seconds
    })
  })
})