import { describe, it, expect } from 'vitest'

describe('Telegram Progressive Status Logic', () => {
  it('should format references correctly', () => {
    function formatReferences(refs: { title?: string; url?: string }[]): string {
      if (refs.length === 0) return ''
      
      let result = '\n\n📚 <b>참고 문서:</b>\n'
      let validRefIndex = 1
      refs.forEach((ref) => {
        if (ref.title && ref.url) {
          result += `${validRefIndex}. <a href="${ref.url}">${ref.title}</a>\n`
          validRefIndex++
        }
      })
      return result
    }
    
    const refs = [
      { title: '학사 규정', url: 'https://example.com/policy1' },
      { title: undefined, url: 'https://example.com/policy2' }, // title 없음
      { title: '시험 규정', url: undefined }, // url 없음
      { title: '졸업 규정', url: 'https://example.com/policy3' }
    ]
    
    const formatted = formatReferences(refs)
    
    expect(formatted).toContain('📚 <b>참고 문서:</b>')
    expect(formatted).toContain('1. <a href="https://example.com/policy1">학사 규정</a>')
    expect(formatted).toContain('2. <a href="https://example.com/policy3">졸업 규정</a>')
    expect(formatted).not.toContain('https://example.com/policy2')
    expect(formatted).not.toContain('시험 규정')
  })
})

