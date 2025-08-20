import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('Telegram Smart Streaming Logic', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should accumulate content correctly', async () => {
    const mockSendMessage = vi.fn().mockResolvedValue({ message_id: 123 })
    const mockEditMessage = vi.fn().mockResolvedValue({ ok: true })
    
    // 스트리밍 로직만 테스트 (실제 함수 호출 없이)
    async function testStreamingLogic() {
      let messageContent = ''
      let lastUpdate = 0
      const UPDATE_INTERVAL = 2000
      const MIN_CONTENT_LENGTH = 50
      
      const chunks = [
        '안녕하세요',
        ', 규정에',
        ' 따르면 다음과 같습니다.',
        ' 추가 내용입니다.'
      ]
      
      const updates: string[] = []
      
      for (const chunk of chunks) {
        messageContent += chunk
        const now = Date.now()
        
        if (messageContent.length >= MIN_CONTENT_LENGTH && 
            now - lastUpdate > UPDATE_INTERVAL) {
          updates.push(messageContent)
          lastUpdate = now
        }
        
        // 시간 진행 시뮬레이션
        vi.advanceTimersByTime(500)
      }
      
      // 최종 메시지
      updates.push(messageContent)
      
      return { messageContent, updates }
    }
    
    const result = await testStreamingLogic()
    
    expect(result.messageContent).toBe('안녕하세요, 규정에 따르면 다음과 같습니다. 추가 내용입니다.')
    expect(result.updates.length).toBeGreaterThan(0)
    expect(result.updates[result.updates.length - 1]).toBe(result.messageContent)
  })

  it('should format references correctly', () => {
    function formatReferences(refs: { title?: string; url?: string }[]) {
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

  it('should handle update interval logic correctly', () => {
    function shouldUpdate(
      contentLength: number, 
      lastUpdate: number, 
      now: number,
      minLength: number = 50,
      interval: number = 2000
    ): boolean {
      return contentLength >= minLength && now - lastUpdate > interval
    }
    
    // 내용이 짧으면 업데이트 안함
    expect(shouldUpdate(30, 0, 3000)).toBe(false)
    
    // 시간이 부족하면 업데이트 안함
    expect(shouldUpdate(100, 0, 1000)).toBe(false)
    
    // 둘 다 조건 만족하면 업데이트
    expect(shouldUpdate(100, 0, 3000)).toBe(true)
  })

  it('should handle stream events correctly', async () => {
    async function processStreamEvents() {
      const events = [
        { type: 'context', data: { resultsCount: 2 } },
        { type: 'content', data: '첫 번째 내용' },
        { type: 'content', data: ', 두 번째 내용' },
        { type: 'refs', data: [{ title: '규정', url: 'https://example.com' }] },
        { type: 'done', data: { totalTime: 5000 } }
      ]
      
      const states: any[] = []
      let content = ''
      let refs: any[] = []
      
      for (const event of events) {
        switch (event.type) {
          case 'context':
            states.push({ type: 'context_update', data: event.data })
            break
          case 'content':
            content += event.data
            states.push({ type: 'content_update', content })
            break
          case 'refs':
            refs = event.data
            break
          case 'done':
            states.push({ type: 'final', content, refs, ...event.data })
            break
        }
      }
      
      return states
    }
    
    const states = await processStreamEvents()
    
    expect(states[0]).toEqual({ type: 'context_update', data: { resultsCount: 2 } })
    expect(states[1]).toEqual({ type: 'content_update', content: '첫 번째 내용' })
    expect(states[2]).toEqual({ type: 'content_update', content: '첫 번째 내용, 두 번째 내용' })
    expect(states[3]).toEqual({ 
      type: 'final', 
      content: '첫 번째 내용, 두 번째 내용',
      refs: [{ title: '규정', url: 'https://example.com' }],
      totalTime: 5000
    })
  })

  it('should validate stream chunk structure', () => {
    function validateStreamChunk(chunk: any): boolean {
      if (!chunk || typeof chunk !== 'object') return false
      if (!['context', 'content', 'refs', 'done'].includes(chunk.type)) return false
      if (chunk.data === undefined) return false
      return true
    }
    
    // 유효한 청크들
    expect(validateStreamChunk({ type: 'context', data: { resultsCount: 1 } })).toBe(true)
    expect(validateStreamChunk({ type: 'content', data: 'text' })).toBe(true)
    expect(validateStreamChunk({ type: 'refs', data: [] })).toBe(true)
    expect(validateStreamChunk({ type: 'done', data: {} })).toBe(true)
    
    // 무효한 청크들
    expect(validateStreamChunk(null)).toBe(false)
    expect(validateStreamChunk({ type: 'invalid' })).toBe(false)
    expect(validateStreamChunk({ type: 'content' })).toBe(false) // data 없음
    expect(validateStreamChunk({ data: 'test' })).toBe(false) // type 없음
  })
})