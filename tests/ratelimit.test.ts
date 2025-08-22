import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { allowRequest } from '../src/utils'
import { initializeRateLimiter, checkRateLimit, disposeRateLimiter } from '../src/rate-limit/index.js'
import { MockKVStore } from '../src/rate-limit/kv-store.js'
import type { RateLimitConfig } from '../src/rate-limit/types.js'

describe('Legacy rate limiting (utils.allowRequest)', () => {
  it('allows first request and blocks subsequent within window', () => {
    const key = 'test:user1'
    const win = 1000
    const max = 1
    const a1 = allowRequest(key, win, max)
    const a2 = allowRequest(key, win, max)
    expect(a1.allowed).toBe(true)
    expect(a2.allowed).toBe(false)
    expect(a2.retryAfterSec).toBeGreaterThanOrEqual(1)
  })
})

describe('KV-based rate limiting integration', () => {
  let mockKVStore: MockKVStore
  
  const testConfig: RateLimitConfig = {
    windowMs: 5000,
    max: 3,
    memoryCacheSize: 100,
    memoryCacheTTL: 60000,
    kvEnabled: true,
    adaptiveEnabled: false,
    cleanupInterval: 0,
    cleanupThreshold: 3600000
  }

  beforeEach(() => {
    mockKVStore = new MockKVStore()
    initializeRateLimiter(mockKVStore, testConfig)
  })

  afterEach(() => {
    // Reset global state
    vi.resetAllMocks()
    // Dispose rate limiter to avoid state leaks
    disposeRateLimiter()
  })

  describe('checkRateLimit function', () => {
    it('should handle first request for new user', async () => {
      const result = await checkRateLimit('telegram:123', 5000, 3)
      
      expect(result.allowed).toBe(true)
      expect(result.remaining).toBe(2)
      expect(result.retryAfterSec).toBe(0)
      expect(result.metadata?.source).toBe('new')
      expect(result.metadata?.kvEnabled).toBe(true)
    })

    it('should enforce rate limits correctly', async () => {
      const userId = 'telegram:456'
      
      // Use up the limit
      await checkRateLimit(userId, 5000, 2)
      await checkRateLimit(userId, 5000, 2)
      
      // Third request should be denied
      const result = await checkRateLimit(userId, 5000, 2)
      expect(result.allowed).toBe(false)
      expect(result.remaining).toBe(0)
      expect(result.retryAfterSec).toBeGreaterThan(0)
    })

    it('should return appropriate metadata in response', async () => {
      const userId = 'telegram:789'
      
      const result = await checkRateLimit(userId, 5000, 3)
      
      expect(result.metadata?.source).toBe('new')
      expect(result.metadata?.kvEnabled).toBe(true)
    })

    it('should handle metadata in requests', async () => {
      const userId = 'telegram:metadata-test'
      const metadata = {
        userAgent: 'TelegramBot/1.0',
        endpoint: 'telegram'
      }
      
      const result = await checkRateLimit(userId, 5000, 3, metadata)
      expect(result.allowed).toBe(true)
      expect(result.remaining).toBe(2)
    })

    it('should fallback gracefully when KV fails', async () => {
      // Make KV operations fail
      mockKVStore.shouldFail = true
      
      // Should still work (memory-only fallback)
      const result = await checkRateLimit('telegram:fallback', 5000, 3)
      expect(result.allowed).toBe(true)
      expect(result.remaining).toBe(2)
    })
  })

  describe('Telegram bot integration scenarios', () => {
    it('should handle typical Telegram bot usage pattern', async () => {
      const userId = 'tg:987654321'
      const windowMs = 5000 // 5 seconds
      const maxRequests = 1 // 1 request per 5 seconds
      
      // First message should be allowed
      const result1 = await checkRateLimit(userId, windowMs, maxRequests, {
        userAgent: 'TelegramBot/6.3',
        endpoint: 'telegram'
      })
      expect(result1.allowed).toBe(true)
      expect(result1.remaining).toBe(0)
      
      // Immediate second message should be blocked
      const result2 = await checkRateLimit(userId, windowMs, maxRequests, {
        userAgent: 'TelegramBot/6.3',
        endpoint: 'telegram'
      })
      expect(result2.allowed).toBe(false)
      expect(result2.retryAfterSec).toBeGreaterThan(0)
      expect(result2.retryAfterSec).toBeLessThanOrEqual(5)
    })

    it('should handle chat vs user-based rate limiting', async () => {
      const chatKey = 'tg-chat:123456'
      const userKey = 'tg:789012'
      
      // Chat and user should have independent limits
      const chatResult = await checkRateLimit(chatKey, 5000, 2)
      const userResult = await checkRateLimit(userKey, 5000, 2)
      
      expect(chatResult.allowed).toBe(true)
      expect(userResult.allowed).toBe(true)
      
      // Both should be tracked separately in KV
      expect(await mockKVStore.get('rl:v1:tg-chat:123456')).toBeTruthy()
      expect(await mockKVStore.get('rl:v1:tg:789012')).toBeTruthy()
    })

    it('should handle unknown users gracefully', async () => {
      const unknownKey = 'tg:unknown'
      
      const result = await checkRateLimit(unknownKey, 5000, 1)
      expect(result.allowed).toBe(true)
      
      // Should still be tracked
      const kvRecord = await mockKVStore.get('rl:v1:tg:unknown')
      expect(kvRecord).toBeTruthy()
    })
  })

  describe('Configuration scenarios', () => {
    it('should handle different window sizes', async () => {
      const userId = 'telegram:window-test'
      
      // Use different window sizes
      const result1 = await checkRateLimit(userId, 1000, 3) // 1 second window
      expect(result1.allowed).toBe(true)
      
      const result2 = await checkRateLimit(userId, 5000, 5) // 5 second window
      expect(result2.allowed).toBe(true)
    })

    it('should handle zero limits correctly', async () => {
      const result = await checkRateLimit('telegram:zero-limit', 5000, 0)
      
      expect(result.allowed).toBe(false)
      expect(result.remaining).toBe(0)
      expect(result.retryAfterSec).toBeGreaterThan(0)
    })

    it('should handle very high limits', async () => {
      const userId = 'telegram:high-limit'
      const results = []
      
      // Make 10 requests with high limit
      for (let i = 0; i < 10; i++) {
        const result = await checkRateLimit(userId, 10000, 100)
        results.push(result)
      }
      
      // All should be allowed
      expect(results.every(r => r.allowed)).toBe(true)
      expect(results[9].remaining).toBe(90) // 100 - 10 = 90
    })
  })
})

