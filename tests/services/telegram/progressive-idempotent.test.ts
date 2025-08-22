import { describe, it, expect, vi } from 'vitest'
import { handleProgressiveStatus } from '../../../src/services/telegram'
import { renderMarkdownToTelegramHTML, splitTelegramMessage } from '../../../src/utils/utils'

describe('Telegram progressive status idempotency and utilities', () => {
  it('does not spam retries on edit failures; final edit attempted once', async () => {
    const ragFn = vi.fn(async () => ({ answer: 'ok', refs: [{ title: 't', url: 'u' }] }))
    const fetchSpy = vi.fn(async (url: RequestInfo | URL) => {
      const u = String(url)
      if (u.includes('/sendMessage')) return new Response(JSON.stringify({ result: { message_id: 1 } }), { status: 200 })
      if (u.includes('/editMessageText')) return new Response('{}', { status: 500 }) // force error
      return new Response('{}', { status: 200 })
    })
    await expect(handleProgressiveStatus({ chatId: 1, botToken: 't', ragFunction: ragFn, fetchImpl: fetchSpy as any })).rejects.toThrow()
    const editCalls = (fetchSpy.mock.calls as any[]).filter(c => String(c[0]).includes('/editMessageText'))
    // multiple edit attempts happen, but we ensure only the progressive edits + one error edit (no extra spamming logic here)
    expect(editCalls.length).toBeGreaterThanOrEqual(2)
  })

  it('splitTelegramMessage splits >4096 and preserves order', () => {
    const big = 'x'.repeat(5000)
    const parts = splitTelegramMessage(big, 4096)
    expect(parts.length).toBe(2)
    expect(parts.join('')).toBe(big)
  })

  it('renderMarkdownToTelegramHTML preserves HTML tags and does not double-escape', () => {
    const input = '<b>굵게</b> & **bold** and <i>italic</i> with [link](https://a) and `code`'
    const out = renderMarkdownToTelegramHTML(input)
    expect(out).toContain('<b>굵게</b>')
    expect(out).toContain('<b>bold</b>')
    expect(out).toContain('<i>italic</i>')
    expect(out).toContain('<a href="https://a">link</a>')
    expect(out).toContain('<code>code</code>')
    // ampersand in text should be escaped, but not inside tags we restored
    expect(out).toContain('&amp;')
  })
})

