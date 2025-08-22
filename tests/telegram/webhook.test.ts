import { describe, it, expect, vi } from 'vitest'
import { setWebhook, deleteWebhook, getWebhookInfo } from '../../src/telegram'

describe('telegram webhook scripts', () => {
  it('calls setWebhook with url and secret_token', async () => {
    const fetchSpy = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body))
      expect(body).toMatchObject({ url: 'https://example.dev/telegram/webhook', secret_token: 'secret' })
      return new Response(JSON.stringify({ ok: true, result: true }), { status: 200 })
    })
    const res = await setWebhook({ botToken: '123:abc', url: 'https://example.dev/telegram/webhook', secretToken: 'secret', fetchImpl: fetchSpy as any })
    expect(fetchSpy).toHaveBeenCalled()
    expect(res.ok).toBe(true)
  })

  it('calls deleteWebhook with drop_pending_updates', async () => {
    const fetchSpy = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body))
      expect(body).toMatchObject({ drop_pending_updates: true })
      return new Response(JSON.stringify({ ok: true, result: true }), { status: 200 })
    })
    const res = await deleteWebhook({ botToken: '123:abc', dropPending: true, fetchImpl: fetchSpy as any })
    expect(fetchSpy).toHaveBeenCalled()
    expect(res.ok).toBe(true)
  })

  it('calls getWebhookInfo', async () => {
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ ok: true, result: { url: 'u' } }), { status: 200 }))
    const info = await getWebhookInfo({ botToken: '123:abc', fetchImpl: fetchSpy as any })
    expect(fetchSpy).toHaveBeenCalled()
    expect(info).toMatchObject({ url: 'u' })
  })
})
