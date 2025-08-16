import { describe, it, expect, vi } from 'vitest'
import { sendMessage } from '../src/telegram'

describe('telegram.sendMessage', () => {
  it('POSTs to Telegram sendMessage with MarkdownV2 parse_mode', async () => {
    const fetchSpy = vi.fn(async () => new Response('{}', { status: 200 }))
    const botToken = '123:abc'
    await sendMessage({
      chatId: 42,
      text: '**hi**',
      botToken,
      fetchImpl: fetchSpy as any,
    })
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const call = (fetchSpy as any).mock.calls[0] as any
    const url = String(call?.[0])
    const init = call?.[1] as any
    expect(url).toMatch(`https://api.telegram.org/bot${botToken}/sendMessage`)
    expect(init?.method).toBe('POST')
    const body = JSON.parse(String(init?.body))
    expect(body).toMatchObject({
      chat_id: 42,
      text: '**hi**',
      parse_mode: 'MarkdownV2',
      disable_web_page_preview: true,
    })
  })
})
