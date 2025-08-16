import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { handleRequest } from '../src/handler'

const makeEnv = (overrides: Partial<Record<string, string>> = {}) => ({
  OPENAI_API_KEY: 'sk-test',
  QDRANT_CLOUD_URL: 'https://qdrant.example',
  QDRANT_API_KEY: 'qk',
  COLLECTION_NAME: 'knue_policies',
  TELEGRAM_BOT_TOKEN: '123:abc',
  TELEGRAM_WEBHOOK_SECRET_TOKEN: 'secret',
  LOG_LEVEL: 'error',
  ...overrides,
}) as any

describe('webhook → RAG → sendMessage', () => {
  const originalFetch = globalThis.fetch
  let fetchSpy: any

  beforeEach(() => {
    fetchSpy = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url)
      if (u.includes('/v1/embeddings')) {
        return new Response(JSON.stringify({ data: [{ embedding: [0.1, 0.2] }] }), { status: 200 })
      }
      if (u.includes('/points/search')) {
        return new Response(JSON.stringify({ result: [{ id: 'd1#1', score: 0.9, payload: { title: '학칙', url: 'https://u.ac.kr/reg1', chunk_text: '졸업 학점은 130학점 이상' } }] }), { status: 200 })
      }
      if (u.includes('/v1/chat/completions')) {
        return new Response(JSON.stringify({ choices: [{ message: { content: '졸업 요건은 130학점 이상입니다.' } }] }), { status: 200 })
      }
      if (u.includes('https://api.telegram.org/bot')) {
        return new Response('{}', { status: 200 })
      }
      return new Response('not mocked', { status: 500 })
    })
    // @ts-ignore
    globalThis.fetch = fetchSpy
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('processes a text message and sends a reply', async () => {
    const update = {
      update_id: 1,
      message: {
        message_id: 10,
        text: '졸업 요건 알려줘',
        from: { id: 777, is_bot: false, first_name: 'u' },
        chat: { id: 777, type: 'private' },
      },
    }
    const req = new Request('https://example.com/telegram/webhook', {
      method: 'POST',
      headers: { 'X-Telegram-Bot-Api-Secret-Token': 'secret', 'content-type': 'application/json' },
      body: JSON.stringify(update),
    })
    const res = await handleRequest(req, makeEnv())
    expect(res.status).toBe(200)
    // one call to Telegram sendMessage at least
    const called = fetchSpy.mock.calls.some((c: any[]) => String(c[0]).includes('/sendMessage'))
    expect(called).toBe(true)
  })
})

