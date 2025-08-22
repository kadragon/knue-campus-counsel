import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { HybridRateLimiter } from '../../src/rate-limit/hybrid-limiter.js'
import { MockKVStore } from '../../src/rate-limit/kv-store.js'
import type { RateLimitConfig } from '../../src/rate-limit/types.js'
import * as utils from '../../src/utils/index.js'

describe('Rate Limiting Integration Tests', () => {
  let mockKVStore: MockKVStore
  let rateLimiter: HybridRateLimiter
  let logSpy: any

  const defaultConfig: RateLimitConfig = {
    windowMs: 5000,
    max: 3,
    memoryCacheSize: 100,
    memoryCacheTTL: 60000,
    kvEnabled: true,
    adaptiveEnabled: false,
  }

  beforeEach(() => {
    vi.useFakeTimers()
    logSpy = vi.spyOn(utils, 'log').mockImplementation(() => {})
    mockKVStore = new MockKVStore()
    rateLimiter = new HybridRateLimiter(mockKVStore, defaultConfig)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    rateLimiter.dispose()
  })

  describe('Full rate limiting workflow', () => {
    it('should handle complete user journey from first request to rate limit', async () => {
      const userId = 'telegram:123456'
      const windowMs = 5000
      const maxRequests = 3

      // First request - should be allowed and create new record
      const result1 = await rateLimiter.checkRequest(userId, windowMs, maxRequests)
      expect(result1.allowed).toBe(true)
      expect(result1.remaining).toBe(2)
      expect(result1.metadata?.source).toBe('new')
      expect(result1.metadata?.kvEnabled).toBe(true)

      // Verify KV persistence
      const kvRecord1 = await mockKVStore.get('rl:v1:telegram:123456')
      expect(kvRecord1).toBeTruthy()
      expect(kvRecord1?.timestamps).toHaveLength(1)

      // Second request - should use memory cache
      const result2 = await rateLimiter.checkRequest(userId, windowMs, maxRequests)
      expect(result2.allowed).toBe(true)
      expect(result2.remaining).toBe(1)
      expect(result2.metadata?.source).toBe('cache')

      // Third request - last allowed request
      const result3 = await rateLimiter.checkRequest(userId, windowMs, maxRequests)
      expect(result3.allowed).toBe(true)
      expect(result3.remaining).toBe(0)
      expect(result3.metadata?.source).toBe('cache')

      // Fourth request - should be denied
      const result4 = await rateLimiter.checkRequest(userId, windowMs, maxRequests)
      expect(result4.allowed).toBe(false)
      expect(result4.remaining).toBe(0)
      expect(result4.retryAfterSec).toBeGreaterThan(0)

      // Verify final KV state
      const kvRecord4 = await mockKVStore.get('rl:v1:telegram:123456')
      expect(kvRecord4?.timestamps).toHaveLength(3) // Only successful requests
    })

    it('should handle cache miss and KV recovery scenario', async () => {
      const userId = 'telegram:789012'
      const windowMs = 10000
      const maxRequests = 2

      // Create initial record
      await rateLimiter.checkRequest(userId, windowMs, maxRequests)
      
      // Clear memory cache to simulate cache miss
      rateLimiter.clearMemoryCache()

      // Next request should load from KV
      const result = await rateLimiter.checkRequest(userId, windowMs, maxRequests)
      expect(result.allowed).toBe(true)
      expect(result.remaining).toBe(0) // Already has 1 request
      expect(result.metadata?.source).toBe('kv')

      // Third request should be denied
      const result3 = await rateLimiter.checkRequest(userId, windowMs, maxRequests)
      expect(result3.allowed).toBe(false)
    })

    it('should handle KV failure with graceful degradation', async () => {
      const userId = 'telegram:345678'
      const windowMs = 5000
      const maxRequests = 2

      // First request works normally
      const result1 = await rateLimiter.checkRequest(userId, windowMs, maxRequests)
      expect(result1.allowed).toBe(true)

      // Simulate KV failure
      mockKVStore.shouldFail = true

      // Second request should still work (memory only)
      const result2 = await rateLimiter.checkRequest(userId, windowMs, maxRequests)
      expect(result2.allowed).toBe(true)
      expect(result2.remaining).toBe(0)

      // Third request should be denied (memory-based limiting)
      const result3 = await rateLimiter.checkRequest(userId, windowMs, maxRequests)
      expect(result3.allowed).toBe(false)

      // Verify error was logged
      expect(logSpy).toHaveBeenCalledWith('error', 'KV persistence failed', expect.any(Object))
    })
  })

  describe('Multi-user scenarios', () => {
    it('should handle multiple users independently', async () => {
      const user1 = 'telegram:111'
      const user2 = 'telegram:222'
      const user3 = 'telegram:333'
      const windowMs = 5000
      const maxRequests = 2

      // Each user gets their own rate limit
      const results = await Promise.all([
        rateLimiter.checkRequest(user1, windowMs, maxRequests),
        rateLimiter.checkRequest(user2, windowMs, maxRequests),
        rateLimiter.checkRequest(user3, windowMs, maxRequests),
      ])

      results.forEach(result => {
        expect(result.allowed).toBe(true)
        expect(result.remaining).toBe(1)
      })

      // Second round - still allowed for all
      const results2 = await Promise.all([
        rateLimiter.checkRequest(user1, windowMs, maxRequests),
        rateLimiter.checkRequest(user2, windowMs, maxRequests),
        rateLimiter.checkRequest(user3, windowMs, maxRequests),
      ])

      results2.forEach(result => {
        expect(result.allowed).toBe(true)
        expect(result.remaining).toBe(0)
      })

      // Third round - should be denied for all
      const results3 = await Promise.all([
        rateLimiter.checkRequest(user1, windowMs, maxRequests),
        rateLimiter.checkRequest(user2, windowMs, maxRequests),
        rateLimiter.checkRequest(user3, windowMs, maxRequests),
      ])

      results3.forEach(result => {
        expect(result.allowed).toBe(false)
        expect(result.remaining).toBe(0)
      })

      // Verify each user has their own KV record
      const kv1 = await mockKVStore.get('rl:v1:telegram:111')
      const kv2 = await mockKVStore.get('rl:v1:telegram:222')
      const kv3 = await mockKVStore.get('rl:v1:telegram:333')

      expect(kv1?.timestamps).toHaveLength(2)
      expect(kv2?.timestamps).toHaveLength(2)
      expect(kv3?.timestamps).toHaveLength(2)
    })

    it('should handle different rate limits for different endpoints', async () => {
      const userId = 'telegram:555'
      
      // Telegram endpoint: 2 requests per 5 seconds
      const telegramResult1 = await rateLimiter.checkRequest(
        userId, 5000, 2, { endpoint: 'telegram' }
      )
      expect(telegramResult1.allowed).toBe(true)
      expect(telegramResult1.remaining).toBe(1)

      // API endpoint: 5 requests per 10 seconds (different window/limit)
      // Since there's already 1 request from telegram, remaining should be 3 (5-2=3)
      const apiResult1 = await rateLimiter.checkRequest(
        userId, 10000, 5, { endpoint: 'api' }
      )
      expect(apiResult1.allowed).toBe(true)
      expect(apiResult1.remaining).toBe(3) // 5 max - 2 used = 3 remaining

      // The API request should update the window configuration
      const kvRecord = await mockKVStore.get('rl:v1:telegram:555')
      expect(kvRecord?.windowMs).toBe(10000)
      expect(kvRecord?.maxRequests).toBe(5)
      expect(kvRecord?.metadata?.endpoint).toBe('api')
    })
  })

  describe('Time-based scenarios', () => {
    it('should reset rate limits after window expires', async () => {
      const userId = 'telegram:999'
      const windowMs = 5000
      const maxRequests = 2

      // Use up the rate limit
      await rateLimiter.checkRequest(userId, windowMs, maxRequests)
      await rateLimiter.checkRequest(userId, windowMs, maxRequests)
      
      const deniedResult = await rateLimiter.checkRequest(userId, windowMs, maxRequests)
      expect(deniedResult.allowed).toBe(false)

      // Advance time past the window
      vi.advanceTimersByTime(6000)

      // Should be allowed again
      const allowedResult = await rateLimiter.checkRequest(userId, windowMs, maxRequests)
      expect(allowedResult.allowed).toBe(true)
      expect(allowedResult.remaining).toBe(1)
    })

    it('should handle sliding window correctly', async () => {
      const userId = 'telegram:777'
      const windowMs = 10000
      const maxRequests = 3

      const startTime = Date.now()

      // Make requests at specific times
      const result1 = await rateLimiter.checkRequest(userId, windowMs, maxRequests)
      expect(result1.allowed).toBe(true)

      vi.advanceTimersByTime(3000)
      const result2 = await rateLimiter.checkRequest(userId, windowMs, maxRequests)
      expect(result2.allowed).toBe(true)

      vi.advanceTimersByTime(3000)
      const result3 = await rateLimiter.checkRequest(userId, windowMs, maxRequests)
      expect(result3.allowed).toBe(true)

      // Fourth request should be denied (all 3 within 10 seconds)
      const result4 = await rateLimiter.checkRequest(userId, windowMs, maxRequests)
      expect(result4.allowed).toBe(false)

      // Advance time so first request is outside window (>10 seconds ago)
      vi.advanceTimersByTime(5000) // Total: 11 seconds since first request

      // Should be allowed again (first request aged out)
      const result5 = await rateLimiter.checkRequest(userId, windowMs, maxRequests)
      expect(result5.allowed).toBe(true)
    })
  })

  describe('Memory and KV consistency', () => {
    it('should maintain consistency between memory cache and KV store', async () => {
      const userId = 'telegram:consistency'
      const windowMs = 5000
      const maxRequests = 3

      // Make some requests
      await rateLimiter.checkRequest(userId, windowMs, maxRequests)
      await rateLimiter.checkRequest(userId, windowMs, maxRequests)

      // Check memory state
      const memoryStats = rateLimiter.getMemoryStats()
      expect(memoryStats.size).toBe(1)

      // Check KV state
      const kvRecord = await mockKVStore.get('rl:v1:telegram:consistency')
      expect(kvRecord?.timestamps).toHaveLength(2)

      // Clear memory cache
      rateLimiter.clearMemoryCache()
      expect(rateLimiter.getMemoryStats().size).toBe(0)

      // Next request should reload from KV and continue correctly
      const reloadResult = await rateLimiter.checkRequest(userId, windowMs, maxRequests)
      expect(reloadResult.allowed).toBe(true)
      expect(reloadResult.remaining).toBe(0)
      expect(reloadResult.metadata?.source).toBe('kv')

      // Memory should be populated again
      expect(rateLimiter.getMemoryStats().size).toBe(1)

      // Fourth request should be denied
      const deniedResult = await rateLimiter.checkRequest(userId, windowMs, maxRequests)
      expect(deniedResult.allowed).toBe(false)
    })

    it('should handle KV data corruption gracefully', async () => {
      const userId = 'telegram:corrupted'
      const rlKey = 'rl:v1:telegram:corrupted'

      // Create valid record first
      await rateLimiter.checkRequest(userId, 5000, 3)

      // Corrupt the KV data
      await mockKVStore.put(rlKey, {
        timestamps: null as any, // Corrupted data
        windowMs: 5000,
        maxRequests: 3,
        lastAccess: Date.now()
      })

      // Clear memory to force KV load
      rateLimiter.clearMemoryCache()

      // Should handle corruption gracefully and reset
      const result = await rateLimiter.checkRequest(userId, 5000, 3)
      expect(result.allowed).toBe(true)
      expect(result.remaining).toBe(2) // Reset to fresh state

      // Verify error was logged
      expect(logSpy).toHaveBeenCalledWith(
        'error', 
        'Corrupted rate limit data detected, resetting', 
        { key: rlKey }
      )
    })
  })


  describe('Resource management', () => {
    it('should properly dispose of all resources', async () => {
      const userId = 'telegram:dispose-test'
      
      // Create some state
      await rateLimiter.checkRequest(userId, 5000, 3)
      expect(rateLimiter.getMemoryStats().size).toBe(1)

      // Dispose should clean everything
      rateLimiter.dispose()
      expect(rateLimiter.getMemoryStats().size).toBe(0)

      // Multiple dispose calls should be safe
      rateLimiter.dispose()
      rateLimiter.dispose()
    })
  })
})