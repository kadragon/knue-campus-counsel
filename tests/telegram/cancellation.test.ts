import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as telegram from '../../src/telegram'

describe('Telegram progressive status - cancellation', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('edits to error message when ragFunction throws (cancellation)', async () => {
    const ragFunction = vi.fn().mockRejectedValue(new Error('cancelled'))

    const fakeFetch: any = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ result: { message_id: 123 } })
    })

    await expect(
      telegram.handleProgressiveStatus({
        chatId: 1,
        botToken: 'tg-token',
        ragFunction,
        fetchImpl: fakeFetch,
      })
    ).rejects.toThrow('cancelled')

    // Verify fetch calls and final error edit content
    const calls = fakeFetch.mock.calls
    expect(calls.length).toBeGreaterThanOrEqual(3)
    expect(String(calls[0][0])).toContain('/sendMessage')
    expect(String(calls[1][0])).toContain('/editMessageText')
    // Last call should be error edit
    const lastCall = calls[calls.length - 1]
    const body = JSON.parse(lastCall[1].body)
    expect(body.text).toContain('❌')
  })
})
