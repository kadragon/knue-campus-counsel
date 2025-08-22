import { describe, it, expect } from 'vitest'
import { loadConfig } from '../../src/config'
import { validateEnv } from '../../src/env-validation'

const base = {
  OPENAI_API_KEY: 'sk',
  QDRANT_URL: 'https://qdrant.local',
  QDRANT_API_KEY: 'qk',
  QDRANT_COLLECTION: 'knue-regs',
  TELEGRAM_BOT_TOKEN: 'tg',
}

describe('env validation (extended)', () => {
  it('rejects invalid numeric bounds', () => {
    const env = {
      ...base,
      BOARD_COLLECTION_TOP_K: '0',
      POLICY_COLLECTION_TOP_K: '-1',
      RATE_LIMIT_WINDOW_MS: '50',
      RATE_LIMIT_MAX: '-5',
      RATE_LIMIT_MEMORY_CACHE_SIZE: '-1',
      RATE_LIMIT_MEMORY_CACHE_TTL: '0',
      RATE_LIMIT_CLEANUP_INTERVAL: '-1',
      RATE_LIMIT_CLEANUP_THRESHOLD: '-1',
    }
    expect(() => loadConfig(env as any)).toThrowError(/Invalid environment configuration/)
  })

  it('collects warnings for missing optional webhook secret', () => {
    const res = validateEnv(base as any)
    expect(res.ok).toBe(true)
    expect(res.warnings.some(w => w.field === 'WEBHOOK_SECRET_TOKEN')).toBe(true)
  })
})
