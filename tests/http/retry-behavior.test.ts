import { describe, it, expect, vi } from 'vitest'
import { fetchWithRetry } from '../../src/http'

describe('HTTP retry/backoff behavior', () => {
  const sleeps: number[] = []
  const spySleep = async (ms: number) => { sleeps.push(ms) }

  it('applies exponential backoff sequence and retries on 429/5xx', async () => {
    sleeps.length = 0
    const calls: { init?: RequestInit }[] = []
    const fakeFetch = vi.fn(async (_: any, init?: RequestInit) => {
      calls.push({ init })
      const n = calls.length
      if (n <= 2) return new Response('nope', { status: n === 1 ? 429 : 500 })
      return new Response('{}', { status: 200 })
    })
    const res = await fetchWithRetry('https://api/x', { method: 'POST', headers: { a: 'b' }, body: JSON.stringify({ z: 1 }) }, { retries: 2, backoffBaseMs: 100, fetchImpl: fakeFetch as any, sleepImpl: spySleep })
    expect(res.ok).toBe(true)
    expect(fakeFetch).toHaveBeenCalledTimes(3)
    expect(sleeps).toEqual([100, 200])
    // headers/body preserved across retries
    calls.forEach(c => {
      expect(c.init?.headers).toMatchObject({ a: 'b' })
      expect(c.init?.body).toBe(JSON.stringify({ z: 1 }))
    })
  })

  it('aborts/timeout and throws with timeout info', async () => {
    const never = () => new Promise<Response>(() => {})
    await expect(fetchWithRetry('https://api/timeout', {}, { timeoutMs: 30, fetchImpl: never as any, sleepImpl: spySleep })).rejects.toThrow(/timeout/i)
  })
})

