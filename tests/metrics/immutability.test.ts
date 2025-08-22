import { describe, it, expect, beforeEach } from 'vitest'
import { InMemoryMetrics } from '../../src/metrics/metrics'
import { getMetrics, setMetrics } from '../../src/metrics/metrics-registry'

describe('Metrics snapshot immutability and registry', () => {
  let m: InMemoryMetrics
  beforeEach(() => { m = new InMemoryMetrics() })

  it('snapshot returns fresh objects; previous snapshots don\'t change', () => {
    const s1 = m.snapshot()
    m.incAllow(); m.incKvError('get'); m.incL1Hit()
    const s2 = m.snapshot()
    expect(s1).toEqual({ allow: 0, deny: 0, l1Hits: 0, kvErrors: { get: 0, put: 0, delete: 0, list: 0 } })
    expect(s2).toEqual({ allow: 1, deny: 0, l1Hits: 1, kvErrors: { get: 1, put: 0, delete: 0, list: 0 } })
    // Mutating s2 must not affect future snapshots
    ;(s2 as any).allow = 999
    const s3 = m.snapshot()
    expect(s3.allow).toBe(1)
  })

  it('handles high-volume increments exactly', () => {
    for (let i = 0; i < 10000; i++) m.incKvError('list')
    expect(m.snapshot().kvErrors.list).toBe(10000)
  })

  it('registry returns singleton and can swap', () => {
    const a = getMetrics()
    const b = getMetrics()
    expect(a).toBe(b)
    const custom = new InMemoryMetrics()
    setMetrics(custom)
    const c = getMetrics()
    expect(c).toBe(custom)
  })
})

