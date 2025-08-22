import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { HybridRateLimiter } from '../../src/rate-limit/hybrid-limiter.js'
import { MockKVStore } from '../../src/rate-limit/kv-store.js'
import type { RateLimitConfig } from '../../src/rate-limit/types.js'
import * as utils from '../../src/utils/utils.js'

describe('Rate Limiting Performance Tests', () => {
  let mockKVStore: MockKVStore
  let rateLimiter: HybridRateLimiter
  let logSpy: any

  const defaultConfig: RateLimitConfig = {
    windowMs: 5000,
    max: 10,
    memoryCacheSize: 1000,
    memoryCacheTTL: 60000,
    kvEnabled: true,
    adaptiveEnabled: false,
  }

  beforeEach(() => {
    logSpy = vi.spyOn(utils, 'log').mockImplementation(() => {})
    mockKVStore = new MockKVStore()
    rateLimiter = new HybridRateLimiter(mockKVStore, defaultConfig)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    rateLimiter.dispose()
  })

  describe('Throughput performance', () => {
    it('should handle high throughput sequential requests efficiently', async () => {
      const userId = 'perf-test-sequential'
      const windowMs = 60000 // 1 minute window
      const maxRequests = 1000
      const requestCount = 500

      const startTime = performance.now()

      // Make many sequential requests
      for (let i = 0; i < requestCount; i++) {
        await rateLimiter.checkRequest(userId, windowMs, maxRequests)
      }

      const endTime = performance.now()
      const duration = endTime - startTime
      const throughput = requestCount / (duration / 1000) // requests per second

      // Should handle at least 100 requests per second
      expect(throughput).toBeGreaterThan(100)
      
      console.log(`Sequential throughput: ${throughput.toFixed(2)} req/s`)
      console.log(`Average latency: ${(duration / requestCount).toFixed(2)}ms per request`)
    })

    it('should handle concurrent requests for different users efficiently', async () => {
      const userCount = 100
      const requestsPerUser = 5
      const windowMs = 60000
      const maxRequests = 10

      const startTime = performance.now()

      // Create concurrent requests for multiple users
      const promises: Promise<any>[] = []
      for (let userId = 0; userId < userCount; userId++) {
        for (let req = 0; req < requestsPerUser; req++) {
          promises.push(
            rateLimiter.checkRequest(`user-${userId}`, windowMs, maxRequests)
          )
        }
      }

      const results = await Promise.all(promises)
      const endTime = performance.now()

      const duration = endTime - startTime
      const totalRequests = userCount * requestsPerUser
      const throughput = totalRequests / (duration / 1000)

      // All requests should succeed (within limits)
      const successful = results.filter(r => r.allowed).length
      expect(successful).toBe(totalRequests)

      // Should handle concurrent load efficiently
      expect(throughput).toBeGreaterThan(50)

      console.log(`Concurrent throughput: ${throughput.toFixed(2)} req/s`)
      console.log(`Total requests: ${totalRequests}, Duration: ${duration.toFixed(2)}ms`)
    })
  })

  describe('Memory efficiency', () => {
    it('should manage memory efficiently with many users', async () => {
      const userCount = 500
      const windowMs = 30000
      const maxRequests = 3

      // Create records for many users
      for (let i = 0; i < userCount; i++) {
        await rateLimiter.checkRequest(`user-${i}`, windowMs, maxRequests)
      }

      const stats = rateLimiter.getMemoryStats()
      expect(stats.size).toBe(userCount)
      expect(stats.utilization).toBeLessThan(100) // Should fit in cache

      // Memory should be bounded by maxSize
      const extraUsers = 200
      for (let i = userCount; i < userCount + extraUsers; i++) {
        await rateLimiter.checkRequest(`user-${i}`, windowMs, maxRequests)
      }

      const finalStats = rateLimiter.getMemoryStats()
      expect(finalStats.size).toBeLessThanOrEqual(defaultConfig.memoryCacheSize)
      
      console.log(`Memory efficiency: ${finalStats.size}/${finalStats.maxSize} entries (${finalStats.utilization}% utilization)`)
    })

    it('should handle cache eviction without performance degradation', async () => {
      const cacheSize = defaultConfig.memoryCacheSize
      const windowMs = 30000
      const maxRequests = 5

      // Fill cache beyond capacity
      const overflowUsers = Math.floor(cacheSize * 1.5)
      
      const startTime = performance.now()
      
      for (let i = 0; i < overflowUsers; i++) {
        await rateLimiter.checkRequest(`overflow-user-${i}`, windowMs, maxRequests)
      }
      
      const midTime = performance.now()
      const fillDuration = midTime - startTime

      // Access early users (should be evicted and need KV lookup)
      for (let i = 0; i < 50; i++) {
        await rateLimiter.checkRequest(`overflow-user-${i}`, windowMs, maxRequests)
      }

      const endTime = performance.now()
      const evictionDuration = endTime - midTime

      // Performance shouldn't degrade significantly with eviction
      const fillThroughput = overflowUsers / (fillDuration / 1000)
      const evictionThroughput = 50 / (evictionDuration / 1000)

      console.log(`Fill throughput: ${fillThroughput.toFixed(2)} req/s`)
      console.log(`Eviction access throughput: ${evictionThroughput.toFixed(2)} req/s`)

      // Eviction access should be at least 20% of fill performance
      expect(evictionThroughput).toBeGreaterThan(fillThroughput * 0.2)
    })
  })

  describe('KV performance', () => {
    it('should maintain performance with KV operations', async () => {
      const userId = 'kv-perf-test'
      const requestCount = 100
      const windowMs = 60000
      const maxRequests = 200

      // Test with KV enabled
      const kvStartTime = performance.now()
      
      for (let i = 0; i < requestCount; i++) {
        await rateLimiter.checkRequest(userId, windowMs, maxRequests)
        // Clear cache occasionally to force KV access
        if (i % 20 === 0) {
          rateLimiter.clearMemoryCache()
        }
      }
      
      const kvEndTime = performance.now()
      const kvDuration = kvEndTime - kvStartTime

      // Test with KV disabled for comparison
      const noKvConfig = { ...defaultConfig, kvEnabled: false }
      const noKvLimiter = new HybridRateLimiter(mockKVStore, noKvConfig)
      
      const memoryStartTime = performance.now()
      
      for (let i = 0; i < requestCount; i++) {
        await noKvLimiter.checkRequest(`memory-${userId}`, windowMs, maxRequests)
        if (i % 20 === 0) {
          noKvLimiter.clearMemoryCache()
        }
      }
      
      const memoryEndTime = performance.now()
      const memoryDuration = memoryEndTime - memoryStartTime

      const kvThroughput = requestCount / (kvDuration / 1000)
      const memoryThroughput = requestCount / (memoryDuration / 1000)

      console.log(`KV-enabled throughput: ${kvThroughput.toFixed(2)} req/s`)
      console.log(`Memory-only throughput: ${memoryThroughput.toFixed(2)} req/s`)

      // KV operations reduce performance but should still be reasonable
      expect(kvThroughput).toBeGreaterThan(memoryThroughput * 0.1) // At least 10% of memory-only performance

      noKvLimiter.dispose()
    })

    it('should handle KV failures without significant performance impact', async () => {
      const userId = 'kv-failure-test'
      const requestCount = 100
      const windowMs = 30000
      const maxRequests = 150

      // Test normal operation
      const normalStartTime = performance.now()
      
      for (let i = 0; i < requestCount; i++) {
        await rateLimiter.checkRequest(`normal-${userId}`, windowMs, maxRequests)
      }
      
      const normalEndTime = performance.now()
      const normalDuration = normalEndTime - normalStartTime

      // Test with KV failures
      mockKVStore.shouldFail = true
      
      const failureStartTime = performance.now()
      
      for (let i = 0; i < requestCount; i++) {
        await rateLimiter.checkRequest(`failure-${userId}`, windowMs, maxRequests)
      }
      
      const failureEndTime = performance.now()
      const failureDuration = failureEndTime - failureStartTime

      const normalThroughput = requestCount / (normalDuration / 1000)
      const failureThroughput = requestCount / (failureDuration / 1000)

      console.log(`Normal operation throughput: ${normalThroughput.toFixed(2)} req/s`)
      console.log(`KV failure throughput: ${failureThroughput.toFixed(2)} req/s`)

      // With KV failures, it may actually be slower due to error handling overhead
      // but should still maintain reasonable performance (at least 5% of normal)
      expect(failureThroughput).toBeGreaterThan(normalThroughput * 0.05)
    })
  })


  describe('Latency benchmarks', () => {
    it('should maintain low latency under various conditions', async () => {
      const iterations = 100
      const windowMs = 30000
      const maxRequests = 10

      // Warm up
      for (let i = 0; i < 10; i++) {
        await rateLimiter.checkRequest('warmup', windowMs, maxRequests)
      }

      // Test cache hits (fastest path)
      const cacheHitLatencies: number[] = []
      for (let i = 0; i < iterations; i++) {
        const start = performance.now()
        await rateLimiter.checkRequest('cache-hit-user', windowMs, maxRequests)
        const end = performance.now()
        cacheHitLatencies.push(end - start)
      }

      // Test cache misses with KV reads
      const cacheMissLatencies: number[] = []
      for (let i = 0; i < iterations; i++) {
        rateLimiter.clearMemoryCache()
        const start = performance.now()
        await rateLimiter.checkRequest('cache-miss-user', windowMs, maxRequests)
        const end = performance.now()
        cacheMissLatencies.push(end - start)
      }

      // Test new user creation
      const newUserLatencies: number[] = []
      for (let i = 0; i < iterations; i++) {
        const start = performance.now()
        await rateLimiter.checkRequest(`new-user-${i}`, windowMs, maxRequests)
        const end = performance.now()
        newUserLatencies.push(end - start)
      }

      const avgCacheHit = cacheHitLatencies.reduce((a, b) => a + b, 0) / iterations
      const avgCacheMiss = cacheMissLatencies.reduce((a, b) => a + b, 0) / iterations
      const avgNewUser = newUserLatencies.reduce((a, b) => a + b, 0) / iterations

      console.log(`Average latencies:`)
      console.log(`  Cache hit: ${avgCacheHit.toFixed(2)}ms`)
      console.log(`  Cache miss: ${avgCacheMiss.toFixed(2)}ms`)
      console.log(`  New user: ${avgNewUser.toFixed(2)}ms`)

      // Latency requirements
      expect(avgCacheHit).toBeLessThan(1) // Cache hits should be sub-millisecond
      expect(avgCacheMiss).toBeLessThan(5) // Cache misses should be under 5ms
      expect(avgNewUser).toBeLessThan(3) // New users should be under 3ms

      // P99 latencies should also be reasonable
      const p99CacheHit = percentile(cacheHitLatencies, 99)
      const p99CacheMiss = percentile(cacheMissLatencies, 99)
      const p99NewUser = percentile(newUserLatencies, 99)

      console.log(`P99 latencies:`)
      console.log(`  Cache hit: ${p99CacheHit.toFixed(2)}ms`)
      console.log(`  Cache miss: ${p99CacheMiss.toFixed(2)}ms`)
      console.log(`  New user: ${p99NewUser.toFixed(2)}ms`)

      expect(p99CacheHit).toBeLessThan(5)
      expect(p99CacheMiss).toBeLessThan(20)
      expect(p99NewUser).toBeLessThan(15)
    })
  })

  describe('Resource usage benchmarks', () => {
    it('should demonstrate resource efficiency', async () => {
      const userCount = 500
      const requestsPerUser = 10
      const windowMs = 60000
      const maxRequests = 20

      const startTime = performance.now()

      // Generate realistic load
      for (let i = 0; i < userCount; i++) {
        for (let j = 0; j < requestsPerUser; j++) {
          await rateLimiter.checkRequest(`bench-user-${i}`, windowMs, maxRequests)
        }
      }

      const endTime = performance.now()
      const totalDuration = endTime - startTime
      const totalRequests = userCount * requestsPerUser

      // Memory stats
      const memoryStats = rateLimiter.getMemoryStats()
      
      // KV stats
      const kvKeys = await mockKVStore.list('rl:v1:', 1000)

      console.log(`\nResource Usage Benchmark:`)
      console.log(`  Total requests: ${totalRequests}`)
      console.log(`  Total time: ${totalDuration.toFixed(2)}ms`)
      console.log(`  Throughput: ${(totalRequests / (totalDuration / 1000)).toFixed(2)} req/s`)
      console.log(`  Memory cache: ${memoryStats.size}/${memoryStats.maxSize} (${memoryStats.utilization}%)`)
      console.log(`  KV records: ${kvKeys.length}`)
      console.log(`  Memory efficiency: ${(memoryStats.size / userCount * 100).toFixed(1)}% cache hit potential`)

      // Assertions for resource efficiency
      expect(memoryStats.utilization).toBeLessThanOrEqual(100)
      expect(kvKeys.length).toBe(userCount)
      expect(totalRequests / (totalDuration / 1000)).toBeGreaterThan(50) // At least 50 req/s
    })
  })
})

function percentile(arr: number[], p: number): number {
  const sorted = [...arr].sort((a, b) => a - b)
  const index = Math.ceil((p / 100) * sorted.length) - 1
  return sorted[index]
}