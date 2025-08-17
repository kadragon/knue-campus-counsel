import { describe, it, expect } from 'vitest'
import { allowRequest } from '../src/utils'

describe('utils.allowRequest', () => {
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

