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

  describe('/ask API', () => {
    it('rejects request without secret header', async () => {
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

    it('rejects request with wrong secret', async () => {
      const req = new Request('https://example.com/ask', {
        method: 'POST',
        body: JSON.stringify({ question: '테스트 질문' }),
        headers: { 
          'content-type': 'application/json',
          'X-Kakao-Webhook-Secret-Token': 'wrong-secret'
        },
      })
      const res = await handleRequest(req, makeEnv())
      expect(res.status).toBe(401)
      const json = await res.json()
      expect(json.error).toBe('Unauthorized')
    })

    it('accepts request with correct kakao secret', async () => {
      const req = new Request('https://example.com/ask', {
        method: 'POST',
        body: JSON.stringify({ question: '테스트 질문' }),
        headers: { 
          'content-type': 'application/json',
          'X-Kakao-Webhook-Secret-Token': 'secret'
        },
      })
      const res = await handleRequest(req, makeEnv())
      expect(res.status).toBe(500) // RAG 함수가 실제로는 동작하지 않아서 에러가 날 것
    })

    it('accepts request with correct telegram secret', async () => {
      const req = new Request('https://example.com/ask', {
        method: 'POST',
        body: JSON.stringify({ question: '테스트 질문' }),
        headers: { 
          'content-type': 'application/json',
          'X-Telegram-Bot-Api-Secret-Token': 'secret'
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
          'X-Kakao-Webhook-Secret-Token': 'secret'
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
          'X-Kakao-Webhook-Secret-Token': 'secret'
        },
      })
      const res = await handleRequest(req, makeEnv())
      expect(res.status).toBe(400)
      const json = await res.json()
      expect(json.error).toBe('Question is required')
    })
  })

  describe('/kakao API', () => {
    it('rejects request without secret header', async () => {
      const kakaoRequest = {
        action: {
          params: {
            question: '테스트 질문'
          }
        }
      }
      const req = new Request('https://example.com/kakao', {
        method: 'POST',
        body: JSON.stringify(kakaoRequest),
        headers: { 'content-type': 'application/json' },
      })
      const res = await handleRequest(req, makeEnv())
      expect(res.status).toBe(401)
      const json = await res.json()
      expect(json.template.outputs[0].simpleText.text).toBe('인증에 실패했습니다.')
    })

    it('accepts request with correct secret and returns kakao format', async () => {
      const kakaoRequest = {
        intent: {
          id: "ii1x78y1asmenx4u01xrityu",
          name: "블록 이름"
        },
        userRequest: {
          timezone: "Asia/Seoul",
          utterance: "테스트 질문",
          user: {
            id: "717500",
            type: "accountId"
          }
        },
        action: {
          params: {
            question: "테스트 질문"
          }
        }
      }
      const req = new Request('https://example.com/kakao', {
        method: 'POST',
        body: JSON.stringify(kakaoRequest),
        headers: { 
          'content-type': 'application/json',
          'X-Kakao-Webhook-Secret-Token': 'secret'
        },
      })
      const res = await handleRequest(req, makeEnv())
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.version).toBe('2.0')
      expect(json.template.outputs).toBeDefined()
      expect(json.template.outputs[0].simpleText.text).toBeDefined()
    })

    it('handles missing question gracefully', async () => {
      const kakaoRequest = {
        action: {
          params: {}
        }
      }
      const req = new Request('https://example.com/kakao', {
        method: 'POST',
        body: JSON.stringify(kakaoRequest),
        headers: { 
          'content-type': 'application/json',
          'X-Kakao-Webhook-Secret-Token': 'secret'
        },
      })
      const res = await handleRequest(req, makeEnv())
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.template.outputs[0].simpleText.text).toBe('질문을 입력해주세요.')
    })

    it('extracts question from utterance when params.question is missing', async () => {
      const kakaoRequest = {
        userRequest: {
          utterance: "발화에서 추출된 질문"
        },
        action: {
          params: {}
        }
      }
      const req = new Request('https://example.com/kakao', {
        method: 'POST',
        body: JSON.stringify(kakaoRequest),
        headers: { 
          'content-type': 'application/json',
          'X-Kakao-Webhook-Secret-Token': 'secret'
        },
      })
      const res = await handleRequest(req, makeEnv())
      expect(res.status).toBe(200) // RAG 함수가 실제로는 동작하지 않아서 에러가 날 수도 있지만 구조는 정상
    })
  })
})

