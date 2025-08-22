import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { HybridRateLimiter } from '../../src/rate-limit/hybrid-limiter.js'
import { MockKVStore } from '../../src/rate-limit/kv-store.js'
import type { RateLimitConfig } from '../../src/rate-limit/types.js'

describe('Rate limiter window boundaries and isolation', () => {
  let kv: MockKVStore
  let cfg: RateLimitConfig

  beforeEach(() => {
    vi.useFakeTimers()
    kv = new MockKVStore()
    cfg = {
      windowMs: 1000,
      max: 2,
      kvEnabled: true,
      memoryCacheSize: 100,
      memoryCacheTTL: 60_000,
      adaptiveEnabled: false,
    }
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('strictly prunes timestamps <= windowStart; boundary exact allowed; -1ms denied', async () => {
    const limiter = new HybridRateLimiter(kv, cfg)
    const base = Date.now()
    vi.setSystemTime(base)
    // First allowed
    expect((await limiter.checkRequest('k', 1000, 1)).allowed).toBe(true)

    // At t = base + 999 (within window) → deny
    vi.setSystemTime(base + 999)
    expect((await limiter.checkRequest('k', 1000, 1)).allowed).toBe(false)

    // Exactly at boundary: base + 1000 → allowed (strict > windowStart)
    vi.setSystemTime(base + 1000)
    expect((await limiter.checkRequest('k', 1000, 1)).allowed).toBe(true)

    // 1ms past boundary with max=1, immediate next request should be denied
    vi.setSystemTime(base + 1001)
    expect((await limiter.checkRequest('k', 1000, 1)).allowed).toBe(false)
    limiter.dispose()
  })

  it('isolates many distinct keys (KV enabled)', async () => {
    const limiter = new HybridRateLimiter(kv, { ...cfg, kvEnabled: true })
    const keys = Array.from({ length: 25 }, (_, i) => `user:${i}`)
    const results = await Promise.all(keys.map(k => limiter.checkRequest(k, 1000, 1)))
    results.forEach(r => expect(r.allowed).toBe(true))
    // Second pass should still allow because each key has its own window
    const results2 = await Promise.all(keys.map(k => limiter.checkRequest(k, 1000, 2)))
    results2.forEach(r => expect(r.allowed).toBe(true))
    limiter.dispose()
  })

  it('isolates many distinct keys (memory-only mode)', async () => {
    const limiter = new HybridRateLimiter(kv, { ...cfg, kvEnabled: false })
    const keys = Array.from({ length: 25 }, (_, i) => `mem:${i}`)
    const results = await Promise.all(keys.map(k => limiter.checkRequest(k, 1000, 1)))
    results.forEach(r => expect(r.allowed).toBe(true))
    limiter.dispose()
  })

})
