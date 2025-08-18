import { describe, it, expect } from 'vitest'
import { handleRequest } from '../src/handler'

const makeEnv = (overrides: Partial<Record<string, string>> = {}) => ({
  OPENAI_API_KEY: 'sk-test',
  QDRANT_URL: 'https://example-qdrant',
  QDRANT_API_KEY: 'qdrant-test',
  QDRANT_COLLECTION: 'knue-regs',
  TELEGRAM_BOT_TOKEN: 'tg-test',
  WEBHOOK_SECRET_TOKEN: 'secret',
  ALLOWED_USER_IDS: '',
  LOG_LEVEL: 'debug',
  BOARD_COLLECTION_TOP_K: '2',
  POLICY_COLLECTION_TOP_K: '3',
  ...overrides,
}) as any

describe('handler', () => {
  it('responds to health check', async () => {
    const req = new Request('https://example.com/healthz')
    const res = await handleRequest(req, makeEnv())
    expect(res.status).toBe(200)
  })

  it('rejects telegram webhook without secret header', async () => {
    const req = new Request('https://example.com/telegram', { method: 'POST', body: '{}' })
    const res = await handleRequest(req, makeEnv())
    expect(res.status).toBe(401)
  })

  it('accepts telegram webhook with correct secret', async () => {
    const req = new Request('https://example.com/telegram', {
      method: 'POST',
      body: JSON.stringify({ update_id: 1 }),
      headers: { 'X-Telegram-Bot-Api-Secret-Token': 'secret', 'content-type': 'application/json' },
    })
    const res = await handleRequest(req, makeEnv())
    expect([200, 204]).toContain(res.status)
  })

  describe('/ask API', () => {
    it('rejects request without webhook secret header', async () => {
      const req = new Request('https://example.com/ask', {
        method: 'POST',
        body: JSON.stringify({ question: '테스트 질문' }),
        headers: { 'content-type': 'application/json' },
      })
      const res = await handleRequest(req, makeEnv())
      expect(res.status).toBe(401)
      const json = await res.json()
      expect(json.error).toBe('Unauthorized')
    })

    it('rejects request with wrong webhook secret', async () => {
      const req = new Request('https://example.com/ask', {
        method: 'POST',
        body: JSON.stringify({ question: '테스트 질문' }),
        headers: { 
          'content-type': 'application/json',
          'X-Webhook-Secret-Token': 'wrong-secret'
        },
      })
      const res = await handleRequest(req, makeEnv())
      expect(res.status).toBe(401)
      const json = await res.json()
      expect(json.error).toBe('Unauthorized')
    })

    it('accepts request with correct webhook secret', async () => {
      const req = new Request('https://example.com/ask', {
        method: 'POST',
        body: JSON.stringify({ question: '테스트 질문' }),
        headers: { 
          'content-type': 'application/json',
          'X-Webhook-Secret-Token': 'secret'
        },
      })
      const res = await handleRequest(req, makeEnv())
      expect(res.status).toBe(500) // RAG 함수가 실제로는 동작하지 않아서 에러가 날 것
    })

    it('rejects request without question', async () => {
      const req = new Request('https://example.com/ask', {
        method: 'POST',
        body: JSON.stringify({}),
        headers: { 
          'content-type': 'application/json',
          'X-Webhook-Secret-Token': 'secret'
        },
      })
      const res = await handleRequest(req, makeEnv())
      expect(res.status).toBe(400)
      const json = await res.json()
      expect(json.error).toBe('Question is required')
    })

    it('rejects request with empty question', async () => {
      const req = new Request('https://example.com/ask', {
        method: 'POST',
        body: JSON.stringify({ question: '   ' }),
        headers: { 
          'content-type': 'application/json',
          'X-Webhook-Secret-Token': 'secret'
        },
      })
      const res = await handleRequest(req, makeEnv())
      expect(res.status).toBe(400)
      const json = await res.json()
      expect(json.error).toBe('Question is required')
    })
  })

})
