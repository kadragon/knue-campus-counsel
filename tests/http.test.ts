import { describe, it, expect, vi } from 'vitest'
import { fetchWithRetry } from '../src/http'

const immediate = async (ms: number) => {}

describe('fetchWithRetry', () => {
  it('retries on 429/5xx and eventually succeeds', async () => {
    const calls: number[] = []
    const fakeFetch = vi.fn(async () => {
      calls.push(Date.now())
      if (calls.length < 3) return new Response('rate limited', { status: 429 })
      return new Response('{}', { status: 200 })
    })
    const res = await fetchWithRetry('https://api.test/retry', { method: 'POST' }, { retries: 2, fetchImpl: fakeFetch as any, sleepImpl: immediate })
    expect(res.ok).toBe(true)
    expect(fakeFetch).toHaveBeenCalledTimes(3)
  })

  it('does not retry on 400', async () => {
    const fakeFetch = vi.fn(async () => new Response('bad', { status: 400 }))
    const res = await fetchWithRetry('https://api.test/no-retry', {}, { retries: 3, fetchImpl: fakeFetch as any, sleepImpl: immediate })
    expect(res.status).toBe(400)
    expect(fakeFetch).toHaveBeenCalledTimes(1)
  })

  it('times out long requests', async () => {
    const never = () => new Promise<Response>(() => {})
    await expect(
      fetchWithRetry('https://api.test/timeout', {}, { timeoutMs: 50, fetchImpl: never as any, sleepImpl: immediate })
    ).rejects.toThrow(/timeout/i)
  })
})

