import { describe, it, expect, vi } from 'vitest'
import { chatCompleteStream, chatComplete } from '../../../src/services/openai'

function encode(s: string) { return new TextEncoder().encode(s) }

describe('OpenAI streaming SSE quirks', () => {
  it('skips empty/malformed deltas and stops on [DONE] mid-batch', async () => {
    const chunks = [
      'data: {}\n\n',
      'data: {"choices":[{"delta":{"content":"A"}}]}\n',
      'data: [DONE]\n',
      'data: {"choices":[{"delta":{"content":"ignored"}}]}\n\n',
    ]
    const mockRes = { ok: true, body: { getReader: () => ({
      read: vi.fn()
        .mockResolvedValueOnce({ done: false, value: encode(chunks[0]) })
        .mockResolvedValueOnce({ done: false, value: encode(chunks[1]) })
        .mockResolvedValueOnce({ done: false, value: encode(chunks[2]) })
        .mockResolvedValueOnce({ done: false, value: encode(chunks[3]) })
        .mockResolvedValueOnce({ done: true }),
      releaseLock: vi.fn(),
    }) } }
    const mockFetch = vi.fn().mockResolvedValue(mockRes)
    const out: string[] = []
    for await (const s of chatCompleteStream({ apiKey: 'k', model: 'm', messages: [], fetchImpl: mockFetch })) out.push(s)
    expect(out).toEqual(['A'])
  })

  it('handles multi-chunk JSON fragments across reads', async () => {
    const part1 = 'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n'
    const part2 = 'data: {"choices":[{"delta":{"content":"lo"}}]}\n\n'
    const done = 'data: [DONE]\n\n'
    const mockRes = { ok: true, body: { getReader: () => ({
      read: vi.fn()
        .mockResolvedValueOnce({ done: false, value: encode(part1.slice(0, 10)) })
        .mockResolvedValueOnce({ done: false, value: encode(part1.slice(10) + part2) })
        .mockResolvedValueOnce({ done: false, value: encode(done) })
        .mockResolvedValueOnce({ done: true }),
      releaseLock: vi.fn(),
    }) } }
    const mockFetch = vi.fn().mockResolvedValue(mockRes)
    const out: string[] = []
    for await (const s of chatCompleteStream({ apiKey: 'k', model: 'm', messages: [], fetchImpl: mockFetch })) out.push(s)
    expect(out.join('')).toBe('Hello')
  })

  it('propagates error JSON on non-2xx', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 500, text: () => Promise.resolve('{"error":"x"}') })
    const iter = chatCompleteStream({ apiKey: 'k', model: 'm', messages: [], fetchImpl: mockFetch })
    await expect(async () => { for await (const _ of iter) {} }).rejects.toThrow(/500/)
  })
})

describe('OpenAI non-stream chat defaults', () => {
  it('applies temperature/maxTokens defaults and supports temperature=0 override', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ choices: [{ message: { content: 'ok' } }], usage: {} }) })
    await chatComplete({ apiKey: 'k', model: 'm', messages: [] as any, fetchImpl: mockFetch })
    const call1 = mockFetch.mock.calls[0]![1]!
    const body1 = JSON.parse(String(call1.body))
    expect(body1.temperature).toBe(0.1)
    expect(body1.max_tokens).toBe(500)

    await chatComplete({ apiKey: 'k', model: 'm', messages: [] as any, temperature: 0, fetchImpl: mockFetch })
    const call2 = mockFetch.mock.calls[1]![1]!
    const body2 = JSON.parse(String(call2.body))
    expect(body2.temperature).toBe(0)
  })
})

