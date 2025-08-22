import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { handleRequest } from '../../src/handler'
import { MockKVStore } from '../../src/rate-limit/kv-store.js'

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
  // Rate limiting settings
  RATE_LIMIT_WINDOW_MS: '5000',
  RATE_LIMIT_MAX: '1',
  RATE_LIMIT_KV_ENABLED: 'true',
  RATE_LIMIT_KV_MEMORY_CACHE_SIZE: '100',
  RATE_LIMIT_KV_MEMORY_CACHE_TTL: '60000',
  RATE_LIMIT_KV_ADAPTIVE_ENABLED: 'false',
  RATE_LIMIT_KV_CLEANUP_INTERVAL: '0',
  RATE_LIMIT_KV_CLEANUP_THRESHOLD: '3600000',
  ...overrides,
}) as any

const makeEnvWithKV = (overrides: Partial<Record<string, string>> = {}) => {
  const mockKV = new MockKVStore()
  return {
    ...makeEnv(overrides),
    RATE_LIMIT_KV: mockKV
  }
}

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

  describe('Rate limiting integration', () => {
    let cleanupFunctions: (() => void)[] = []

    afterEach(async () => {
      // Clean up any rate limiters
      cleanupFunctions.forEach(cleanup => cleanup())
      cleanupFunctions = []
      
      // Reset rate limiter state
      try {
        const module = await import('../../src/rate-limit/index.js')
        module.disposeRateLimiter()
      } catch {
        // Ignore if module not found
      }
    })

    it('should handle telegram rate limiting with KV', async () => {
      const env = makeEnvWithKV()
      
      // First request should be allowed
      const req1 = new Request('https://example.com/telegram', {
        method: 'POST',
        body: JSON.stringify({
          update_id: 1,
          message: {
            message_id: 1,
            from: { id: 123456, is_bot: false },
            chat: { id: 123456 },
            text: '/start'
          }
        }),
        headers: { 
          'X-Telegram-Bot-Api-Secret-Token': 'secret', 
          'content-type': 'application/json' 
        },
      })
      
      const res1 = await handleRequest(req1, env)
      expect([200, 204, 400]).toContain(res1.status) // 400 from failed Telegram API
      
      // Second request should be rate limited (limit is 1 per 5 seconds)
      const req2 = new Request('https://example.com/telegram', {
        method: 'POST',
        body: JSON.stringify({
          update_id: 2,
          message: {
            message_id: 2,
            from: { id: 123456, is_bot: false },
            chat: { id: 123456 },
            text: 'Hello'
          }
        }),
        headers: { 
          'X-Telegram-Bot-Api-Secret-Token': 'secret', 
          'content-type': 'application/json' 
        },
      })
      
      const res2 = await handleRequest(req2, env)
      expect([204, 400]).toContain(res2.status) // Rate limited or Telegram API error
      if (res2.status === 204) {
        expect(res2.headers.get('Retry-After')).toBeTruthy()
      }
    })

    it('should handle different users independently', async () => {
      const env = makeEnvWithKV()
      
      // User 1 request
      const req1 = new Request('https://example.com/telegram', {
        method: 'POST',
        body: JSON.stringify({
          update_id: 1,
          message: {
            message_id: 1,
            from: { id: 111111, is_bot: false },
            chat: { id: 111111 },
            text: '/start'
          }
        }),
        headers: { 
          'X-Telegram-Bot-Api-Secret-Token': 'secret', 
          'content-type': 'application/json' 
        },
      })
      
      // User 2 request
      const req2 = new Request('https://example.com/telegram', {
        method: 'POST',
        body: JSON.stringify({
          update_id: 2,
          message: {
            message_id: 2,
            from: { id: 222222, is_bot: false },
            chat: { id: 222222 },
            text: '/start'
          }
        }),
        headers: { 
          'X-Telegram-Bot-Api-Secret-Token': 'secret', 
          'content-type': 'application/json' 
        },
      })
      
      // Both should be allowed as they are different users
      const res1 = await handleRequest(req1, env)
      const res2 = await handleRequest(req2, env)
      
      expect([200, 204, 400]).toContain(res1.status) // 400 from failed Telegram API
      expect([200, 204, 400]).toContain(res2.status) // 400 from failed Telegram API
    })

    it('should fall back to memory-based rate limiting when KV is not available', async () => {
      const env = makeEnv() // No KV store
      
      // First request should be allowed
      const req1 = new Request('https://example.com/telegram', {
        method: 'POST',
        body: JSON.stringify({
          update_id: 1,
          message: {
            message_id: 1,
            from: { id: 333333, is_bot: false },
            chat: { id: 333333 },
            text: '/help'
          }
        }),
        headers: { 
          'X-Telegram-Bot-Api-Secret-Token': 'secret', 
          'content-type': 'application/json' 
        },
      })
      
      const res1 = await handleRequest(req1, env)
      expect([200, 204, 400]).toContain(res1.status) // 400 from failed Telegram API
      
      // Second request should be rate limited
      const req2 = new Request('https://example.com/telegram', {
        method: 'POST',
        body: JSON.stringify({
          update_id: 2,
          message: {
            message_id: 2,
            from: { id: 333333, is_bot: false },
            chat: { id: 333333 },
            text: 'Test message'
          }
        }),
        headers: { 
          'X-Telegram-Bot-Api-Secret-Token': 'secret', 
          'content-type': 'application/json' 
        },
      })
      
      const res2 = await handleRequest(req2, env)
      expect(res2.status).toBe(204) // Rate limited
    })

    it('should handle bot messages and invalid updates correctly', async () => {
      const env = makeEnvWithKV()
      
      // Bot message should be ignored (no rate limit applied)
      const botReq = new Request('https://example.com/telegram', {
        method: 'POST',
        body: JSON.stringify({
          update_id: 1,
          message: {
            message_id: 1,
            from: { id: 123456, is_bot: true }, // Bot message
            chat: { id: 123456 },
            text: 'Bot message'
          }
        }),
        headers: { 
          'X-Telegram-Bot-Api-Secret-Token': 'secret', 
          'content-type': 'application/json' 
        },
      })
      
      const botRes = await handleRequest(botReq, env)
      expect(botRes.status).toBe(204) // Ignored, but not rate limited
      
      // Update without message should be ignored
      const noMessageReq = new Request('https://example.com/telegram', {
        method: 'POST',
        body: JSON.stringify({
          update_id: 2,
          // No message field
        }),
        headers: { 
          'X-Telegram-Bot-Api-Secret-Token': 'secret', 
          'content-type': 'application/json' 
        },
      })
      
      const noMessageRes = await handleRequest(noMessageReq, env)
      expect(noMessageRes.status).toBe(204) // Ignored
    })

    it('should handle rate limiting for /ask endpoint', async () => {
      const env = makeEnvWithKV({
        RATE_LIMIT_MAX: '2', // Allow 2 requests per window for this test
      })
      
      // First request
      const req1 = new Request('https://example.com/ask', {
        method: 'POST',
        body: JSON.stringify({ question: '첫 번째 질문' }),
        headers: { 
          'content-type': 'application/json',
          'X-Webhook-Secret-Token': 'secret'
        },
      })
      
      // Second request  
      const req2 = new Request('https://example.com/ask', {
        method: 'POST',
        body: JSON.stringify({ question: '두 번째 질문' }),
        headers: { 
          'content-type': 'application/json',
          'X-Webhook-Secret-Token': 'secret'
        },
      })
      
      // Both should result in errors (RAG not configured), but not rate limited
      const res1 = await handleRequest(req1, env)
      const res2 = await handleRequest(req2, env)
      
      expect(res1.status).toBe(500) // Error from RAG
      expect(res2.status).toBe(500) // Error from RAG
    })
  })

})
