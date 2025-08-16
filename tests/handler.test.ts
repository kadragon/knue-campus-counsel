import { describe, it, expect } from 'vitest'
import { handleRequest } from '../src/handler'

const makeEnv = (overrides: Partial<Record<string, string>> = {}) => ({
  OPENAI_API_KEY: 'sk-test',
  QDRANT_URL: 'https://example-qdrant',
  QDRANT_API_KEY: 'qdrant-test',
  QDRANT_COLLECTION: 'knue-regs',
  TELEGRAM_BOT_TOKEN: 'tg-test',
  TELEGRAM_WEBHOOK_SECRET_TOKEN: 'secret',
  ALLOWED_USER_IDS: '',
  LOG_LEVEL: 'debug',
  ...overrides,
}) as any

describe('handler', () => {
  it('responds to health check', async () => {
    const req = new Request('https://example.com/healthz')
    const res = await handleRequest(req, makeEnv())
    expect(res.status).toBe(200)
  })

  it('rejects webhook without secret header', async () => {
    const req = new Request('https://example.com/telegram/webhook', { method: 'POST', body: '{}' })
    const res = await handleRequest(req, makeEnv())
    expect(res.status).toBe(401)
  })

  it('accepts webhook with correct secret', async () => {
    const req = new Request('https://example.com/telegram/webhook', {
      method: 'POST',
      body: JSON.stringify({ update_id: 1 }),
      headers: { 'X-Telegram-Bot-Api-Secret-Token': 'secret', 'content-type': 'application/json' },
    })
    const res = await handleRequest(req, makeEnv())
    expect([200, 204]).toContain(res.status)
  })
})

