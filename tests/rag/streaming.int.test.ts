import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildRagStream, createEnhancedRagStream } from '../../src/rag/rag'
import type { QdrantHit } from '../../src/services/qdrant'

describe('RAG Streaming', () => {
  const mockConfig = {
    openaiApiKey: 'test-api-key',
    qdrantUrl: 'http://test-qdrant',
    qdrantApiKey: 'test-qdrant-key',
    qdrantCollection: 'test-collection',
    boardCollection: 'test-board-collection',
    model: 'gpt-4o-mini',
    boardTopK: 2,
    policyTopK: 3,
    scoreThreshold: 0.2
  }

  const mockHits: QdrantHit[] = [
    {
      id: '1',
      score: 0.8,
      payload: {
        title: '테스트 규정',
        content: '이것은 테스트 규정입니다.',
        link: 'https://example.com/policy1',
        source: 'policy'
      }
    },
    {
      id: '2', 
      score: 0.7,
      payload: {
        title: '테스트 게시물',
        content: '이것은 테스트 게시물입니다.',
        link: 'https://example.com/board1',
        source: 'knue_board'
      }
    }
  ]

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('buildRagStream', () => {
    it('should stream RAG pipeline results correctly', async () => {
      const mockEmbed = vi.fn().mockResolvedValue([0.1, 0.2, 0.3])
      const mockSearch = vi.fn().mockResolvedValue([
        {
          id: '1',
          score: 0.8,
          title: '테스트 규정',
          content: '이것은 테스트 규정입니다.',
          link: 'https://example.com/policy1',
          sourceType: 'policy'
        }
      ])
      
      const mockChatStream = vi.fn(async function*() {
        yield '안녕하세요'
        yield ', 답변'
        yield '입니다.'
      })

      const ragStream = buildRagStream({
        embed: mockEmbed,
        search: mockSearch,
        chatStream: mockChatStream,
        model: 'gpt-4o-mini',
        topK: 5,
        scoreThreshold: 0.2
      })

      const query = '테스트 질문입니다'
      const results = []
      
      for await (const chunk of ragStream(query)) {
        results.push(chunk)
      }

      // 예상되는 이벤트 순서와 타입 검증
      expect(results[0]).toEqual({
        type: 'context',
        data: { resultsCount: 1 }
      })

      expect(results[1]).toEqual({
        type: 'content',
        data: '안녕하세요'
      })

      expect(results[2]).toEqual({
        type: 'content', 
        data: ', 답변'
      })

      expect(results[3]).toEqual({
        type: 'content',
        data: '입니다.'
      })

      expect(results[4]).toEqual({
        type: 'refs',
        data: [{ title: '테스트 규정', url: 'https://example.com/policy1' }]
      })

      expect(results[5]).toEqual({
        type: 'done',
        data: expect.objectContaining({
          resultsCount: 1,
          refsCount: 1,
          totalTime: expect.any(Number)
        })
      })

      // 함수 호출 검증
      expect(mockEmbed).toHaveBeenCalledWith('테스트 질문입니다')
      expect(mockSearch).toHaveBeenCalledWith([0.1, 0.2, 0.3], query)
      expect(mockChatStream).toHaveBeenCalledWith(
        expect.objectContaining({
          system: expect.any(String),
          user: query,
          context: expect.stringContaining('테스트 규정')
        })
      )
    })

    it('should handle no search results gracefully', async () => {
      const mockEmbed = vi.fn().mockResolvedValue([0.1, 0.2, 0.3])
      const mockSearch = vi.fn().mockResolvedValue([]) // 검색 결과 없음
      const mockChatStream = vi.fn()

      const ragStream = buildRagStream({
        embed: mockEmbed,
        search: mockSearch,
        chatStream: mockChatStream,
        model: 'gpt-4o-mini',
        topK: 5,
        scoreThreshold: 0.2
      })

      const results = []
      for await (const chunk of ragStream('테스트 질문')) {
        results.push(chunk)
      }

      expect(results).toEqual([
        {
          type: 'content',
          data: '문서에서 해당 근거를 찾지 못했습니다.'
        },
        {
          type: 'refs',
          data: []
        },
        {
          type: 'done',
          data: expect.objectContaining({
            totalTime: expect.any(Number)
          })
        }
      ])

      // 채팅 스트림은 호출되지 않아야 함
      expect(mockChatStream).not.toHaveBeenCalled()
    })

    it('should handle streaming errors correctly', async () => {
      const mockEmbed = vi.fn().mockRejectedValue(new Error('Embedding failed'))
      const mockSearch = vi.fn()
      const mockChatStream = vi.fn()

      const ragStream = buildRagStream({
        embed: mockEmbed,
        search: mockSearch,
        chatStream: mockChatStream,
        model: 'gpt-4o-mini',
        topK: 5,
        scoreThreshold: 0.2
      })

      await expect(async () => {
        for await (const chunk of ragStream('테스트 질문')) {
          // 에러가 발생해야 함
        }
      }).rejects.toThrow('Embedding failed')
    })

    it('should filter results by score threshold', async () => {
      const mockEmbed = vi.fn().mockResolvedValue([0.1, 0.2, 0.3])
      const mockSearch = vi.fn().mockResolvedValue([
        { id: '1', score: 0.3, title: '높은 점수', content: '내용1', link: 'url1', sourceType: 'policy' },
        { id: '2', score: 0.1, title: '낮은 점수', content: '내용2', link: 'url2', sourceType: 'policy' }
      ])
      
      const mockChatStream = vi.fn(async function*() {
        yield '답변'
      })

      const ragStream = buildRagStream({
        embed: mockEmbed,
        search: mockSearch,
        chatStream: mockChatStream,
        model: 'gpt-4o-mini',
        topK: 5,
        scoreThreshold: 0.2 // 0.2 이상만 허용
      })

      const results = []
      for await (const chunk of ragStream('테스트 질문')) {
        results.push(chunk)
      }

      // context 이벤트에서 필터링된 결과 수 확인
      const contextEvent = results.find(r => r.type === 'context')
      expect(contextEvent?.data.resultsCount).toBe(1) // 낮은 점수는 필터링됨

      // refs에서도 하나만 포함되어야 함
      const refsEvent = results.find(r => r.type === 'refs')
      expect(refsEvent?.data).toHaveLength(1)
      expect(refsEvent?.data[0].title).toBe('높은 점수')
    })
  })

  describe('createEnhancedRagStream', () => {
    it('should create rag stream with proper configuration', async () => {
      // OpenAI embedding API mock
      const mockEmbeddingResponse = {
        ok: true,
        json: () => Promise.resolve({
          data: [{ embedding: [0.1, 0.2, 0.3] }],
          usage: { total_tokens: 10 }
        })
      }

      // Qdrant search API mock
      const mockQdrantResponse = {
        ok: true,
        json: () => Promise.resolve({
          result: mockHits
        })
      }

      // OpenAI chat stream API mock
      const mockStreamResponse = {
        ok: true,
        body: {
          getReader: () => ({
            read: vi.fn()
              .mockResolvedValueOnce({ 
                done: false, 
                value: new TextEncoder().encode('data: {"choices":[{"delta":{"content":"테스트"}}]}\n\n') 
              })
              .mockResolvedValueOnce({ 
                done: false, 
                value: new TextEncoder().encode('data: {"choices":[{"delta":{"content":" 답변"}}]}\n\n') 
              })
              .mockResolvedValueOnce({ 
                done: false, 
                value: new TextEncoder().encode('data: [DONE]\n\n') 
              })
              .mockResolvedValueOnce({ done: true }),
            releaseLock: vi.fn()
          })
        }
      }

      const mockFetch = vi.fn()
        .mockImplementationOnce(() => Promise.resolve(mockEmbeddingResponse)) // embedding
        .mockImplementationOnce(() => Promise.resolve(mockQdrantResponse))    // policy search
        .mockImplementationOnce(() => Promise.resolve(mockQdrantResponse))    // board search
        .mockImplementationOnce(() => Promise.resolve(mockStreamResponse))    // chat stream

      // global fetch mock 설정
      vi.stubGlobal('fetch', mockFetch)

      const ragStream = await createEnhancedRagStream(mockConfig)
      const results = []

      for await (const chunk of ragStream('학점 관련 규정이 궁금합니다')) {
        results.push(chunk)
      }

      // 결과 검증
      expect(results.length).toBeGreaterThan(0)
      expect(results[0].type).toBe('context')
      expect(results.some(r => r.type === 'content')).toBe(true)
      expect(results.some(r => r.type === 'refs')).toBe(true)
      expect(results.some(r => r.type === 'done')).toBe(true)

      // API 호출 검증
      expect(mockFetch).toHaveBeenCalledTimes(4)
      
      // Embedding API 호출 확인
      expect(mockFetch).toHaveBeenNthCalledWith(1, 
        'https://api.openai.com/v1/embeddings',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'authorization': 'Bearer test-api-key'
          }),
          body: expect.stringContaining('text-embedding-3-large')
        })
      )

      // Chat completion stream API 호출 확인
      expect(mockFetch).toHaveBeenNthCalledWith(4,
        'https://api.openai.com/v1/chat/completions', 
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"stream":true')
        })
      )

      vi.unstubAllGlobals()
    })
  })
})
