import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CloudflareKVStore } from '../../src/rate-limit/kv-store.js'
import { getMetrics, setMetrics } from '../../src/metrics/metrics-registry.js'
import { InMemoryMetrics } from '../../src/metrics/metrics'

describe('KV store network error handling + metrics', () => {
  let kv: any
  let store: CloudflareKVStore
  let metrics: InMemoryMetrics

  beforeEach(() => {
    metrics = new InMemoryMetrics()
    setMetrics(metrics)
    kv = {
      get: vi.fn().mockRejectedValue(new Error('net get')),
      put: vi.fn().mockRejectedValue(new Error('net put')),
      delete: vi.fn().mockRejectedValue(new Error('net del')),
      list: vi.fn().mockRejectedValue(new Error('net list')),
    }
    store = new CloudflareKVStore(kv, 'info')
  })

  it('get/put/delete/list errors are handled and counted', async () => {
    const got = await store.get('k')
    expect(got).toBeNull()
    await store.put('k', { timestamps: [], windowMs: 1, maxRequests: 1, lastAccess: Date.now() })
    await store.delete('k')
    const keys = await store.list('p:')
    expect(keys).toEqual([])

    const snap = getMetrics().snapshot()
    expect(snap.kvErrors.get).toBe(1)
    expect(snap.kvErrors.put).toBe(1)
    expect(snap.kvErrors.delete).toBe(1)
    expect(snap.kvErrors.list).toBe(1)
  })
})

