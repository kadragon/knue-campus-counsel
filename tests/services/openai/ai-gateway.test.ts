import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createEmbedding, chatComplete } from '../../../src/services/openai.js'

describe('OpenAI AI Gateway Integration', () => {
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockFetch = vi.fn()
    vi.clearAllMocks()
  })

  describe('createEmbedding with AI Gateway', () => {
    it('should use AI Gateway URL for embedding requests', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          data: [{ embedding: [0.1, 0.2, 0.3] }],
          usage: { total_tokens: 10 }
        })
      })

      await createEmbedding({
        apiKey: 'sk-test',
        input: 'test query',
        model: 'text-embedding-3-large',
        baseUrl: 'https://gateway.ai.cloudflare.com/v1/account123/my-gateway/openai',
        fetchImpl: mockFetch
      })

      expect(mockFetch).toHaveBeenCalledWith(
        'https://gateway.ai.cloudflare.com/v1/account123/my-gateway/openai/embeddings',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'content-type': 'application/json',
            'authorization': 'Bearer sk-test'
          }),
          body: JSON.stringify({
            input: 'test query',
            model: 'text-embedding-3-large'
          })
        })
      )
    })

    it('should fallback to default OpenAI URL when baseUrl is not provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          data: [{ embedding: [0.1, 0.2, 0.3] }],
          usage: { total_tokens: 10 }
        })
      })

      await createEmbedding({
        apiKey: 'sk-test',
        input: 'test query',
        model: 'text-embedding-3-large',
        fetchImpl: mockFetch
      })

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.openai.com/v1/embeddings',
        expect.any(Object)
      )
    })
  })

  describe('chatComplete with AI Gateway', () => {
    it('should use AI Gateway URL for chat completion requests', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: 'Test response' } }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
        })
      })

      await chatComplete({
        apiKey: 'sk-test',
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'test message' }],
        baseUrl: 'https://gateway.ai.cloudflare.com/v1/account123/my-gateway/openai',
        fetchImpl: mockFetch
      })

      expect(mockFetch).toHaveBeenCalledWith(
        'https://gateway.ai.cloudflare.com/v1/account123/my-gateway/openai/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'content-type': 'application/json',
            'authorization': 'Bearer sk-test'
          }),
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: 'test message' }],
            temperature: 0.1,
            max_tokens: 500
          })
        })
      )
    })

    it('should preserve all request headers when using AI Gateway', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: 'Test response' } }],
          usage: { total_tokens: 15 }
        })
      })

      await chatComplete({
        apiKey: 'sk-test-key-123',
        model: 'gpt-4o-mini',
        messages: [{ role: 'system', content: 'system prompt' }],
        baseUrl: 'https://gateway.ai.cloudflare.com/v1/test-account/test-gateway/openai',
        fetchImpl: mockFetch
      })

      const [, requestInit] = mockFetch.mock.calls[0]
      expect(requestInit.headers).toEqual({
        'content-type': 'application/json',
        'authorization': 'Bearer sk-test-key-123'
      })
    })
  })

  describe('Error handling with AI Gateway', () => {
    it('should use correct URLs for AI Gateway requests', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          data: [{ embedding: [0.1, 0.2, 0.3] }],
          usage: { total_tokens: 10 }
        })
      })

      await createEmbedding({
        apiKey: 'sk-test',
        input: 'test',
        model: 'text-embedding-3-large',
        baseUrl: 'https://gateway.ai.cloudflare.com/v1/account123/my-gateway/openai',
        fetchImpl: mockFetch
      })

      expect(mockFetch).toHaveBeenCalledWith(
        'https://gateway.ai.cloudflare.com/v1/account123/my-gateway/openai/embeddings',
        expect.any(Object)
      )
    })

    it('should maintain retry behavior with AI Gateway URLs', async () => {
      // First call fails with 429
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          text: () => Promise.resolve('Rate limit exceeded')
        })
        // Second call succeeds
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            choices: [{ message: { content: 'Success after retry' } }],
            usage: { total_tokens: 10 }
          })
        })

      const result = await chatComplete({
        apiKey: 'sk-test',
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'test' }],
        baseUrl: 'https://gateway.ai.cloudflare.com/v1/account123/my-gateway/openai',
        fetchImpl: mockFetch
      })

      expect(result).toBe('Success after retry')
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })
  })
})