import { describe, it, expect } from 'vitest'
import { loadConfig } from '../src/config'

const base = {
  OPENAI_API_KEY: 'sk',
  QDRANT_URL: 'https://qdrant.local',
  QDRANT_API_KEY: 'qk',
  QDRANT_COLLECTION: 'knue-regs',
  TELEGRAM_BOT_TOKEN: 'tg',
  TELEGRAM_WEBHOOK_SECRET_TOKEN: 'sec',
  LOG_LEVEL: 'info',
}

describe('config.loadConfig', () => {
  it('loads and validates required envs', () => {
    const cfg = loadConfig(base as any)
    expect(cfg.openaiApiKey).toBe('sk')
    expect(cfg.qdrant.url).toBe('https://qdrant.local')
    expect(cfg.qdrant.collection).toBe('knue-regs')
  })

  it('throws on missing required envs', () => {
    expect(() => loadConfig({} as any)).toThrowError(/OPENAI_API_KEY/)
  })

  it('parses ALLOWED_USER_IDS as number set', () => {
    const cfg = loadConfig({ ...base, ALLOWED_USER_IDS: '123, 456' } as any)
    expect(cfg.allowedUserIds).toEqual(new Set([123, 456]))
  })

  it('accepts QDRANT_CLOUD_URL and COLLECTION_NAME aliases', () => {
    const env = {
      OPENAI_API_KEY: 'sk',
      QDRANT_CLOUD_URL: 'https://qdrant.cloud',
      QDRANT_API_KEY: 'qk',
      COLLECTION_NAME: 'knue_policies',
      TELEGRAM_BOT_TOKEN: 'tg',
      TELEGRAM_WEBHOOK_SECRET_TOKEN: 'sec',
    }
    const cfg = loadConfig(env as any)
    expect(cfg.qdrant.url).toBe('https://qdrant.cloud')
    expect(cfg.qdrant.collection).toBe('knue_policies')
  })

  it('sets default chat model to gpt-4.1-mini when unspecified', () => {
    const cfg = loadConfig(base as any)
    expect(cfg.chatModel).toBe('gpt-4.1-mini')
  })
})
