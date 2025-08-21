import { fetchWithRetry } from './http'
import { measureAsync, log } from './utils'
type FetchLike = typeof fetch

export async function createEmbedding(opts: {
  apiKey: string
  input: string | string[]
  model: string
  fetchImpl?: FetchLike
}): Promise<number[]> {
  return measureAsync('OpenAI Embedding API', async () => {
    const { apiKey, input, model, fetchImpl = fetch } = opts
    
    log('debug', 'Creating OpenAI embedding', {
      model,
      inputType: Array.isArray(input) ? 'array' : 'string',
      // 배열일 경우 아이템 수가 아니라 전체 문자열 길이 합계를 기록
      inputLength: Array.isArray(input)
        ? input.reduce((n, s) => n + (typeof s === 'string' ? s.length : 0), 0)
        : input.length
    })
    
    const res = await fetchWithRetry('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ input, model }),
    }, { fetchImpl })
    
    if (!res.ok) {
      const errorText = await res.text()
      throw new Error(`OpenAI embeddings error: ${res.status} - ${errorText}`)
    }
    
    const json = await res.json() as any
    const embedding = json.data?.[0]?.embedding ?? []
    
    log('debug', 'OpenAI embedding completed', {
      embeddingDimensions: embedding.length,
      tokensUsed: json.usage?.total_tokens
    })
    
    return embedding
  })
}

export async function chatComplete(opts: {
  apiKey: string
  model: string
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[]
  temperature?: number
  maxTokens?: number
  fetchImpl?: FetchLike
}): Promise<string> {
  return measureAsync('OpenAI Chat Completion API', async () => {
    const { apiKey, model, messages, temperature = 0.1, maxTokens = 500, fetchImpl = fetch } = opts
    
    log('debug', 'Starting OpenAI chat completion', {
      model,
      messageCount: messages.length,
      temperature,
      maxTokens,
      systemPromptLength: messages.find(m => m.role === 'system')?.content?.length,
      userPromptLength: messages.find(m => m.role === 'user')?.content?.length
    })
    
    const res = await fetchWithRetry('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens }),
    }, { fetchImpl })
    
    if (!res.ok) {
      const errorText = await res.text()
      throw new Error(`OpenAI chat error: ${res.status} - ${errorText}`)
    }
    
    const json = await res.json() as any
    const content = json.choices?.[0]?.message?.content ?? ''
    
    log('debug', 'OpenAI chat completion finished', {
      responseLength: content.length,
      promptTokens: json.usage?.prompt_tokens,
      completionTokens: json.usage?.completion_tokens,
      totalTokens: json.usage?.total_tokens,
      finishReason: json.choices?.[0]?.finish_reason
    })
    
    return content
  })
}

export async function* chatCompleteStream(opts: {
  apiKey: string
  model: string
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[]
  temperature?: number
  maxTokens?: number
  fetchImpl?: FetchLike
}): AsyncGenerator<string, void, unknown> {
  const { apiKey, model, messages, temperature = 0.1, maxTokens = 500, fetchImpl = fetch } = opts
  
  log('debug', 'Starting OpenAI chat completion stream', {
    model,
    messageCount: messages.length,
    temperature,
    maxTokens,
    systemPromptLength: messages.find(m => m.role === 'system')?.content?.length,
    userPromptLength: messages.find(m => m.role === 'user')?.content?.length
  })

  const res = await fetchWithRetry('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ 
      model, 
      messages, 
      temperature, 
      max_tokens: maxTokens,
      stream: true 
    }),
  }, { fetchImpl })

  if (!res.ok) {
    const errorText = await res.text()
    throw new Error(`OpenAI chat stream error: ${res.status} - ${errorText}`)
  }

  const reader = res.body?.getReader()
  if (!reader) {
    throw new Error('No response body reader available')
  }

  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || '' // 마지막 불완전한 라인은 버퍼에 유지

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith('data: ')) continue
        
        const data = trimmed.slice(6) // 'data: ' 제거
        if (data === '[DONE]') return

        try {
          const parsed = JSON.parse(data)
          const content = parsed.choices?.[0]?.delta?.content
          if (content) {
            yield content
          }
        } catch (e) {
          // JSON 파싱 에러 무시 (불완전한 청크일 수 있음)
          log('debug', 'Failed to parse streaming chunk', { data, error: e })
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}
