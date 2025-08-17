import { describe, it, expect } from 'vitest'
import { splitTelegramMessage, escapeHtml, escapeMarkdownV2, renderMarkdownToTelegramHTML } from '../src/utils'
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

describe('utils.escapeHtml', () => {
  it('escapes HTML special characters', () => {
    const raw = "<b>Bold & italic</b>"
    const escaped = escapeHtml(raw)
    expect(escaped).toBe('&lt;b&gt;Bold &amp; italic&lt;/b&gt;')
  })
})

describe('utils.renderMarkdownToTelegramHTML', () => {
  it('converts basic markdown to HTML', () => {
    const raw = '**볼드** *이탤릭* `코드`'
    const html = renderMarkdownToTelegramHTML(raw)
    expect(html).toBe('<b>볼드</b> <i>이탤릭</i> <code>코드</code>')
  })

  it('converts links to HTML', () => {
    const raw = '[링크 텍스트](https://example.com)'
    const html = renderMarkdownToTelegramHTML(raw)
    expect(html).toBe('<a href="https://example.com">링크 텍스트</a>')
  })

  it('escapes HTML special characters', () => {
    const raw = 'Text with < and > symbols & ampersand'
    const html = renderMarkdownToTelegramHTML(raw)
    expect(html).toBe('Text with &lt; and &gt; symbols &amp; ampersand')
  })

  it('preserves dates and special characters without over-escaping', () => {
    const raw = '2025. 3. 4.(화) ~ 3. 14.(금) 18시'
    const html = renderMarkdownToTelegramHTML(raw)
    expect(html).toBe('2025. 3. 4.(화) ~ 3. 14.(금) 18시')
  })

  it('removes MarkdownV2 escape sequences', () => {
    const raw = '2025\\. 3\\. 4\\.(화) \\~ 3\\. 14\\.(금) 18시'
    const html = renderMarkdownToTelegramHTML(raw)
    expect(html).toBe('2025. 3. 4.(화) ~ 3. 14.(금) 18시')
  })

  it('preserves existing HTML tags while converting markdown', () => {
    const raw = 'Some <b>existing</b> **new bold** text'
    const html = renderMarkdownToTelegramHTML(raw)
    expect(html).toBe('Some <b>existing</b> <b>new bold</b> text')
  })

  it('handles mixed content with escape sequences', () => {
    const raw = '안녕하세요\\! **골프장** 관련 (출처\\: \\[#1\\]) 내용입니다\\.'
    const html = renderMarkdownToTelegramHTML(raw)
    expect(html).toBe('안녕하세요! <b>골프장</b> 관련 (출처: [#1]) 내용입니다.')
  })
})
