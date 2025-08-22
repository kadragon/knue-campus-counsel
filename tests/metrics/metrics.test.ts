import { describe, it, expect, beforeEach } from 'vitest'

// We write tests first (TDD) to define the API
import type { Metrics } from '../../src/metrics'
import { InMemoryMetrics } from '../../src/metrics'

describe('Metrics (TDD)', () => {
  let m: Metrics

  beforeEach(() => {
    m = new InMemoryMetrics()
  })

  it('starts with zeroed counters and stable snapshot', () => {
    const snap = m.snapshot()
    expect(snap).toEqual({
      allow: 0,
      deny: 0,
      l1Hits: 0,
      kvErrors: { get: 0, put: 0, delete: 0, list: 0 },
    })
    expect(snap).toMatchSnapshot()
  })

  it('increments allow/deny decisions', () => {
    m.incAllow()
    m.incAllow()
    m.incDeny()

    expect(m.snapshot()).toEqual({
      allow: 2,
      deny: 1,
      l1Hits: 0,
      kvErrors: { get: 0, put: 0, delete: 0, list: 0 },
    })
  })

  it('tracks L1 cache hits', () => {
    m.incL1Hit()
    m.incL1Hit()
    m.incL1Hit()
    expect(m.snapshot().l1Hits).toBe(3)
  })

  it('tracks KV errors per operation', () => {
    m.incKvError('get')
    m.incKvError('get')
    m.incKvError('put')
    m.incKvError('delete')
    m.incKvError('list')
    m.incKvError('list')
    m.incKvError('list')

    expect(m.snapshot()).toEqual({
      allow: 0,
      deny: 0,
      l1Hits: 0,
      kvErrors: { get: 2, put: 1, delete: 1, list: 3 },
    })
  })
})
