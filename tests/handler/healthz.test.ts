import { describe, it, expect } from 'vitest'
import { handleRequest } from '../../src/handler'

const baseEnv = {
  OPENAI_API_KEY: 'sk',
  QDRANT_URL: 'https://q',
  QDRANT_API_KEY: 'qk',
  QDRANT_COLLECTION: 'c',
  TELEGRAM_BOT_TOKEN: 'tg',
}

describe('/healthz', () => {
  it('returns structure with kv.enabled, kv.ok, rateLimiter, metrics', async () => {
    const req = new Request('https://x/healthz')
    const res = await handleRequest(req, baseEnv as any)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.status).toBe('ok')
    expect(json).toHaveProperty('kv')
    expect(typeof json.kv.enabled).toBe('boolean')
    expect(json).toHaveProperty('rateLimiter')
    expect(json).toHaveProperty('metrics')
    expect(typeof json.metrics.allow).toBe('number')
  })

  it('reports kv down with ok=false and error string but still 200', async () => {
    const failingKV = { get: async () => { throw new Error('down') }, put: async () => { throw new Error('down') }, delete: async () => {}, list: async () => ({ keys: [] }) }
    const env = { ...baseEnv, RATE_LIMIT_KV: failingKV, RATE_LIMIT_KV_ENABLED: 'true' }
    const req = new Request('https://x/healthz')
    const res = await handleRequest(req, env as any)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.kv.enabled).toBe(true)
    expect(json.kv.ok).toBe(false)
    expect(typeof json.kv.error).toBe('string')
    expect(json.kv.roundTripMs).toBeGreaterThanOrEqual(0)
  })
})

