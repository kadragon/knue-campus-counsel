import { describe, it, expect } from 'vitest'
import { splitTelegramMessage, escapeHtml, escapeMarkdownV2 } from '../src/utils'

describe('utils.splitTelegramMessage', () => {
  it('splits text into <=4096 chunks preserving words', () => {
    const max = 50
    const text = 'a '.repeat(60) + 'tail'
    const chunks = splitTelegramMessage(text, max)
    expect(chunks.length).toBeGreaterThan(1)
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(max)
    expect(chunks.join('')).toBe(text)
  })

  it('returns original when below limit', () => {
    const text = 'short text'
    const chunks = splitTelegramMessage(text, 4096)
    expect(chunks).toEqual([text])
  })

  it('handles long words by hard-splitting', () => {
    const longWord = 'x'.repeat(120)
    const chunks = splitTelegramMessage(longWord, 50)
    expect(chunks.every(c => c.length <= 50)).toBe(true)
    expect(chunks.join('')).toBe(longWord)
  })
})

describe('utils.escapeMarkdownV2', () => {
  it('escapes special characters for Telegram MarkdownV2', () => {
    const raw = "_*[]()~`>#+-=|{}.!"
    const escaped = escapeMarkdownV2(raw)
    expect(escaped).toBe('\\_\\*\\[\\]\\(\\)\\~\\`\\>\\#\\+\\-\\=\\|\\{\\}\\.\\!')
  })

  it('escapes backslashes correctly', () => {
    const raw = "\\test\\"
    const escaped = escapeMarkdownV2(raw)
    expect(escaped).toBe('\\\\test\\\\')
  })
})

describe('utils.escapeHtml (legacy)', () => {
  it('redirects to escapeMarkdownV2 for backward compatibility', () => {
    const raw = "_*[]"
    const escaped = escapeHtml(raw)
    expect(escaped).toBe('\\_\\*\\[\\]')
  })
})
