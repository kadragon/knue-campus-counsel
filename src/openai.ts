import { fetchWithRetry } from './http'
type FetchLike = typeof fetch

export async function createEmbedding(opts: {
  apiKey: string
  input: string | string[]
  model: string
  fetchImpl?: FetchLike
}): Promise<number[]> {
  const { apiKey, input, model, fetchImpl = fetch } = opts
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
    console.error('OpenAI embeddings API error:', res.status, errorText)
    throw new Error(`OpenAI embeddings error: ${res.status} - ${errorText}`)
  }
  const json = await res.json() as any
  return json.data?.[0]?.embedding ?? []
}

export async function chatComplete(opts: {
  apiKey: string
  model: string
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[]
  temperature?: number
  maxTokens?: number
  fetchImpl?: FetchLike
}): Promise<string> {
  const { apiKey, model, messages, temperature = 0.2, maxTokens, fetchImpl = fetch } = opts
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
    console.error('OpenAI chat API error:', res.status, errorText)
    throw new Error(`OpenAI chat error: ${res.status} - ${errorText}`)
  }
  const json = await res.json() as any
  return json.choices?.[0]?.message?.content ?? ''
}
