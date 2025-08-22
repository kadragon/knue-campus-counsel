import { describe, it, expect } from 'vitest'
import { loadConfig } from '../../src/config'

const base = {
  OPENAI_API_KEY: 'sk',
  QDRANT_URL: 'https://q',
  QDRANT_API_KEY: 'qk',
  QDRANT_COLLECTION: 'c',
  TELEGRAM_BOT_TOKEN: 'tg',
}

describe('Config boolean flags and precedence', () => {
  it('parses KV flags true/false strings', () => {
    const cfg1 = loadConfig({ ...base, RATE_LIMIT_KV_ENABLED: 'true' } as any)
    expect(cfg1.rateLimitKV.kvEnabled).toBe(true)
    const cfg2 = loadConfig({ ...base, RATE_LIMIT_KV_ENABLED: 'false' } as any)
    expect(cfg2.rateLimitKV.kvEnabled).toBe(false)
  })

  it('uses KV_* memory settings when provided', () => {
    const cfg = loadConfig({
      ...base,
      RATE_LIMIT_KV_ENABLED: 'true',
      RATE_LIMIT_KV_MEMORY_CACHE_SIZE: '123',
      RATE_LIMIT_KV_MEMORY_CACHE_TTL: '456',
      RATE_LIMIT_KV_CLEANUP_INTERVAL: '789',
      RATE_LIMIT_KV_CLEANUP_THRESHOLD: '321',
      RATE_LIMIT_KV_ADAPTIVE_ENABLED: 'true',
    } as any)
    expect(cfg.rateLimitKV.memoryCacheSize).toBe(123)
    expect(cfg.rateLimitKV.memoryCacheTTL).toBe(456)
    expect(cfg.rateLimitKV.adaptiveEnabled).toBe(true)
  })

  it('QDRANT_URL takes precedence over QDRANT_CLOUD_URL when both present', () => {
    const cfg = loadConfig({ ...base, QDRANT_CLOUD_URL: 'https://cloud', QDRANT_URL: 'https://onprem' } as any)
    expect(cfg.qdrant.url).toBe('https://onprem')
  })
})

