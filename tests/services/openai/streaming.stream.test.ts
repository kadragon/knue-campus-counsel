import { describe, it, expect, vi, beforeEach } from 'vitest'
import { chatCompleteStream, chatComplete } from '../../../src/services/openai'

describe('OpenAI API Streaming', () => {
  const mockApiKey = 'test-api-key'
  const mockModel = 'gpt-4o-mini'
  const mockMessages = [
    { role: 'system' as const, content: 'You are a helpful assistant.' },
    { role: 'user' as const, content: 'Hello, how are you?' }
  ]

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('chatCompleteStream', () => {
    it('should stream response chunks correctly', async () => {
      // Mock SSE response
      const mockChunks = [
        'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":" there"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"!"}}]}\n\n',
        'data: [DONE]\n\n'
      ]

      const mockResponse = {
        ok: true,
        body: {
          getReader: () => ({
            read: vi.fn()
              .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode(mockChunks[0]) })
              .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode(mockChunks[1]) })
              .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode(mockChunks[2]) })
              .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode(mockChunks[3]) })
              .mockResolvedValueOnce({ done: true }),
            releaseLock: vi.fn()
          })
        }
      }

      const mockFetch = vi.fn().mockResolvedValue(mockResponse)

      const stream = chatCompleteStream({
        apiKey: mockApiKey,
        model: mockModel,
        messages: mockMessages,
        temperature: 0.1,
        maxTokens: 500,
        fetchImpl: mockFetch
      })

      const chunks = []
      for await (const chunk of stream) {
        chunks.push(chunk)
      }

      expect(chunks).toEqual(['Hello', ' there', '!'])
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.openai.com/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${mockApiKey}`
          },
          body: JSON.stringify({
            model: mockModel,
            messages: mockMessages,
            temperature: 0.1,
            max_tokens: 500,
            stream: true
          })
        })
      )
    })

    it('should handle streaming errors gracefully', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        text: () => Promise.resolve('Rate limit exceeded')
      })

      const stream = chatCompleteStream({
        apiKey: mockApiKey,
        model: mockModel,
        messages: mockMessages,
        fetchImpl: mockFetch
      })

      await expect(async () => {
        for await (const chunk of stream) {
          // This should throw
        }
      }).rejects.toThrow('OpenAI chat stream error: 429 - Rate limit exceeded')
    })

    it('should handle malformed JSON chunks gracefully', async () => {
      const mockChunks = [
        'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
        'data: {invalid-json}\n\n', // 잘못된 JSON
        'data: {"choices":[{"delta":{"content":" World"}}]}\n\n',
        'data: [DONE]\n\n'
      ]

      const mockResponse = {
        ok: true,
        body: {
          getReader: () => ({
            read: vi.fn()
              .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode(mockChunks[0]) })
              .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode(mockChunks[1]) })
              .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode(mockChunks[2]) })
              .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode(mockChunks[3]) })
              .mockResolvedValueOnce({ done: true }),
            releaseLock: vi.fn()
          })
        }
      }

      const mockFetch = vi.fn().mockResolvedValue(mockResponse)

      const stream = chatCompleteStream({
        apiKey: mockApiKey,
        model: mockModel,
        messages: mockMessages,
        fetchImpl: mockFetch
      })

      const chunks = []
      for await (const chunk of stream) {
        chunks.push(chunk)
      }

      // 잘못된 JSON은 무시되고 유효한 청크만 반환
      expect(chunks).toEqual(['Hello', ' World'])
    })

    it('should use default parameters correctly', async () => {
      const mockResponse = {
        ok: true,
        body: {
          getReader: () => ({
            read: vi.fn()
              .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode('data: [DONE]\n\n') })
              .mockResolvedValueOnce({ done: true }),
            releaseLock: vi.fn()
          })
        }
      }

      const mockFetch = vi.fn().mockResolvedValue(mockResponse)

      const stream = chatCompleteStream({
        apiKey: mockApiKey,
        model: mockModel,
        messages: mockMessages,
        fetchImpl: mockFetch
      })

      // 스트림 소비
      for await (const chunk of stream) {
        // noop
      }

      const callArgs = mockFetch.mock.calls[0][1]
      const body = JSON.parse(callArgs.body)
      
      expect(body.temperature).toBe(0.1)
      expect(body.max_tokens).toBe(500)
      expect(body.stream).toBe(true)
    })
  })

  describe('chatComplete optimizations', () => {
    it('should use optimized parameters by default', async () => {
      const mockResponse = {
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: 'Test response' } }],
          usage: { total_tokens: 100 }
        })
      }

      const mockFetch = vi.fn().mockResolvedValue(mockResponse)

      await chatComplete({
        apiKey: mockApiKey,
        model: mockModel,
        messages: mockMessages,
        fetchImpl: mockFetch
      })

      const callArgs = mockFetch.mock.calls[0][1]
      const body = JSON.parse(callArgs.body)
      
      expect(body.temperature).toBe(0.1) // 최적화된 기본값
      expect(body.max_tokens).toBe(500)  // 최적화된 기본값
    })
  })
})
