import { describe, it, expect, vi } from 'vitest'
import { handleProgressiveStatus } from '../../../src/services/telegram'

describe('Telegram HTML parsing and link generation', () => {
  it('handles malformed URLs and titles without breaking HTML parsing', async () => {
    const ragFn = vi.fn(async () => ({
      answer: 'Test answer',
      refs: [
        { title: 'Title with "quotes" & <tags> and \'single quotes\'', url: 'https://example.com' },
        { title: 'Normal title', url: '  https://example2.com  ' }, // whitespace
        { title: 'Bad URL', url: 'not-a-url' }, // invalid URL
        { title: 'JavaScript URL', url: 'javascript:alert("xss")' }, // dangerous scheme
        { title: 'Data URL', url: 'data:text/html,<script>alert(1)</script>' }, // data scheme
        { title: 'FTP URL', url: 'ftp://example.com/file' }, // non-http scheme
        { title: '', url: 'https://example3.com' }, // empty title
        { title: 'No URL', url: '' }, // empty URL
        { title: 'Malformed URL', url: 'https://[invalid' }, // malformed URL
        { title: 'Title with <script>alert("xss")</script>', url: 'https://safe.com' },
      ]
    }))
    
    const fetchSpy = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url)
      if (u.includes('/sendMessage')) {
        return new Response(JSON.stringify({ result: { message_id: 123 } }), { status: 200 })
      }
      if (u.includes('/editMessageText')) {
        // Extract the body to check the HTML
        const body = init?.body
        if (body) {
          const parsed = JSON.parse(body as string)
          const text = parsed.text
          
          // Validate that HTML is well-formed (no empty attributes)
          expect(text).not.toMatch(/<a\s+href="\s*"/)  // no empty href
          expect(text).not.toMatch(/<a\s+href=""/)     // no empty href quotes
          expect(text).not.toMatch(/<a\s+>/)           // no missing href attribute
          
          // Check that dangerous content is escaped
          expect(text).not.toContain('<script>')
          // Script tags should be escaped, but alert text can remain (it's just text now)
          if (text.includes('&lt;script&gt;')) {
            expect(text).toContain('&quot;xss&quot;') // XSS should be escaped too
          }
          
          // Check that valid links are properly formatted
          if (text.includes('href=')) {
            expect(text).toMatch(/<a href="https?:\/\/[^"]+">/)
          }
        }
        return new Response('{}', { status: 200 })
      }
      return new Response('{}', { status: 200 })
    })
    
    await handleProgressiveStatus({
      chatId: 12345,
      botToken: 'test_token',
      ragFunction: ragFn,
      fetchImpl: fetchSpy as any
    })
    
    // Verify that the function completed without throwing
    expect(ragFn).toHaveBeenCalledOnce()
    
    // Check that only valid URLs were included in the final message
    const editCalls = (fetchSpy.mock.calls as any[]).filter(c => 
      String(c[0]).includes('/editMessageText')
    )
    const finalEditCall = editCalls[editCalls.length - 1]
    const finalBody = JSON.parse(finalEditCall[1].body)
    const finalText = finalBody.text
    
    // Should contain escaped title but valid URL (URL constructor adds trailing slash)
    expect(finalText).toContain('Title with &quot;quotes&quot; &amp; &lt;tags&gt; and &#39;single quotes&#39;')
    expect(finalText).toContain('href="https://example.com/"')
    
    // Should contain trimmed URL
    expect(finalText).toContain('href="https://example2.com/"')
    
    // Should NOT contain invalid or dangerous URLs
    expect(finalText).not.toContain('href="not-a-url"')
    expect(finalText).not.toContain('href=""')
    expect(finalText).not.toContain('javascript:')
    expect(finalText).not.toContain('data:')
    expect(finalText).not.toContain('ftp:')
    expect(finalText).not.toContain('https://[invalid')
    
    // Should contain escaped script tags
    expect(finalText).toContain('&lt;script&gt;')
    expect(finalText).not.toContain('<script>')
  })

  it('generates valid HTML when refs array is empty', async () => {
    const ragFn = vi.fn(async () => ({
      answer: 'Test answer with no references',
      refs: []
    }))
    
    const fetchSpy = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url)
      if (u.includes('/sendMessage')) {
        return new Response(JSON.stringify({ result: { message_id: 123 } }), { status: 200 })
      }
      if (u.includes('/editMessageText')) {
        const body = init?.body
        if (body) {
          const parsed = JSON.parse(body as string)
          const text = parsed.text
          
          // Should not contain reference section
          expect(text).not.toContain('📚 <b>참고 문서:</b>')
          expect(text).toBe('Test answer with no references')
        }
        return new Response('{}', { status: 200 })
      }
      return new Response('{}', { status: 200 })
    })
    
    await handleProgressiveStatus({
      chatId: 12345,
      botToken: 'test_token',
      ragFunction: ragFn,
      fetchImpl: fetchSpy as any
    })
    
    expect(ragFn).toHaveBeenCalledOnce()
  })

  it('handles refs with only title or only URL gracefully', async () => {
    const ragFn = vi.fn(async () => ({
      answer: 'Test answer',
      refs: [
        { title: 'Title only', url: undefined as any },
        { title: undefined as any, url: 'https://example.com' },
        { title: 'Valid ref', url: 'https://valid.com' }
      ]
    }))
    
    const fetchSpy = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url)
      if (u.includes('/sendMessage')) {
        return new Response(JSON.stringify({ result: { message_id: 123 } }), { status: 200 })
      }
      if (u.includes('/editMessageText')) {
        const body = init?.body
        if (body) {
          const parsed = JSON.parse(body as string)
          const text = parsed.text
          
          // Should only contain the valid ref
          const linkCount = (text.match(/<a href=/g) || []).length
          expect(linkCount).toBe(1)
          expect(text).toContain('href="https://valid.com/"')
          expect(text).toContain('Valid ref')
          
          // Should not contain incomplete refs
          expect(text).not.toContain('Title only')
          expect(text).not.toContain('href="undefined"')
        }
        return new Response('{}', { status: 200 })
      }
      return new Response('{}', { status: 200 })
    })
    
    await handleProgressiveStatus({
      chatId: 12345,
      botToken: 'test_token',
      ragFunction: ragFn,
      fetchImpl: fetchSpy as any
    })
    
    expect(ragFn).toHaveBeenCalledOnce()
  })
})