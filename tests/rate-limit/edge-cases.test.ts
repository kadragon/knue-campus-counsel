import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { HybridRateLimiter } from '../../src/rate-limit/hybrid-limiter.js'
import { MockKVStore } from '../../src/rate-limit/kv-store.js'
import type { RateLimitConfig } from '../../src/rate-limit/types.js'

describe('Rate limit edge cases (batch 1)', () => {
  let kv: MockKVStore
  let limiter: HybridRateLimiter
  let config: RateLimitConfig

  beforeEach(() => {
    kv = new MockKVStore()
    config = {
      windowMs: 1000,
      max: 2,
      kvEnabled: true,
      memoryCacheSize: 100,
      memoryCacheTTL: 20, // very small to test TTL expiry
      cleanupThreshold: 3600000,
      cleanupInterval: 0,
      adaptiveEnabled: false,
    }
    limiter = new HybridRateLimiter(kv, config)
  })

  afterEach(() => {
    limiter.dispose()
    vi.useRealTimers()
  })

  it('treats exact window boundary as expired (strict > windowStart)', async () => {
    vi.useFakeTimers()
    const t0 = Date.now()
    // first request at t0
    vi.setSystemTime(t0)
    let r1 = await limiter.checkRequest('user-edge', 1000, 1)
    expect(r1.allowed).toBe(true)

    // next at exactly t0 + window
    vi.setSystemTime(t0 + 1000)
    let r2 = await limiter.checkRequest('user-edge', 1000, 1)
    // should be allowed because previous timestamp is not > windowStart (it equals)
    expect(r2.allowed).toBe(true)
  })

  it('does not exceed max under concurrent requests', async () => {
    const key = 'user-concurrent'
    const windowMs = 2000
    const max = 3

    const promises = Array.from({ length: 10 }).map(() => limiter.checkRequest(key, windowMs, max))
    const results = await Promise.all(promises)
    const allowed = results.filter(r => r.allowed)
    const denied = results.filter(r => !r.allowed)

    expect(allowed.length).toBeLessThanOrEqual(max)
    expect(denied.length + allowed.length).toBe(10)
  })

  it('rehydrates from KV after L1 TTL expiry', async () => {
    vi.useFakeTimers()
    await limiter.checkRequest('user-ttl', 1000, 2)
    // Should be in KV now
    expect(await kv.get('rl:v1:user-ttl')).toBeTruthy()

    // Let memory TTL expire
    vi.advanceTimersByTime(25)

    // Next request should load from KV (not new)
    const res = await limiter.checkRequest('user-ttl', 1000, 2)
    expect(res.metadata?.source).toBe('kv')
  })
})

