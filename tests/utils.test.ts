import { describe, it, expect } from 'vitest'
import { splitTelegramMessage, escapeHtml, escapeMarkdownV2 } from '../src/utils'
import { renderMarkdownToTelegramV2 } from '../src/utils'

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
  it('escapes special characters for Telegram MarkdownV2 (preserving * and _)', () => {
    const raw = "_*[]()~`>#+-=|{}.!"
    const escaped = escapeMarkdownV2(raw)
    expect(escaped).toBe('_*\\[\\]\\(\\)\\~\\`\\>\\#\\+\\-\\=\\|\\{\\}\\.\\!')
  })

  it('escapes backslashes correctly', () => {
    const raw = "\\test\\"
    const escaped = escapeMarkdownV2(raw)
    expect(escaped).toBe('\\\\test\\\\')
  })

  it('normalizes **bold** to *bold* for MarkdownV2', () => {
    const raw = '**강조** 텍스트'
    const escaped = escapeMarkdownV2(raw)
    expect(escaped).toBe('*강조* 텍스트')
  })

describe('utils.renderMarkdownToTelegramV2', () => {
  it('preserves inline code with proper escaping', () => {
    const raw = '코드는 `a\\b` 입니다'
    const out = renderMarkdownToTelegramV2(raw)
    expect(out).toContain('`a\\\\b`') // backslash inside code doubled
  })

  it('preserves fenced code blocks with proper escaping', () => {
    const raw = ['```', 'line1', 'x\\`y', '```'].join('\n')
    const out = renderMarkdownToTelegramV2(raw)
    // ensure code block exists and both backslash and backtick are escaped inside
    expect(out).toMatch(/```[\s\S]*line1[\s\S]*x\\+\`y[\s\S]*```/)
  })

  it('preserves links and escapes URL ) and \\ correctly', () => {
    const raw = '[테스트_링크](http://ex.com/a\\)b\\c) 끝'
    const out = renderMarkdownToTelegramV2(raw)
    // link text escapes underscore, url escapes ) and \
    expect(out).toContain('[테스트\\_링크](')
    expect(out).toMatch(/\(http:\/\/ex\.com\/a/) // URL present
    expect(out).toContain('\\)') // has escaped ) somewhere (likely in URL)
    expect(out).toContain('\\\\c') // backslash in URL doubled before 'c'
  })

  it('keeps italic/bold while escaping other specials', () => {
    const raw = '이건 **중요**이고 (특수) 문자는 [링크](http://ex.com)로 대체!'
    const out = renderMarkdownToTelegramV2(raw)
    expect(out).toContain('*중요*')
    // parentheses outside are escaped in MarkdownV2
    expect(out).toContain('\\(특수\\)')
    // exclamation escaped
    expect(out).toContain('\\!')
  })
})
})

describe('utils.escapeHtml (legacy)', () => {
  it('redirects to escapeMarkdownV2 for backward compatibility', () => {
    const raw = "_*[]"
    const escaped = escapeHtml(raw)
    expect(escaped).toBe('_*\\[\\]')
  })
})
