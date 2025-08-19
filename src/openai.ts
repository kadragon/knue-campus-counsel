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
      inputLength: Array.isArray(input) ? input.length : input.length
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
    const { apiKey, model, messages, temperature = 0.2, maxTokens, fetchImpl = fetch } = opts
    
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
