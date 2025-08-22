import { describe, it, expect, vi } from 'vitest'
import { createEmbedding, chatComplete } from '../../src/openai'
import { qdrantSearch } from '../../src/qdrant'

describe('openai adapters', () => {
  it('calls embeddings endpoint with model + input', async () => {
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ data: [{ embedding: [0.1, 0.2] }] }), { status: 200 }))
    const apiKey = 'sk-test'
    const res = await createEmbedding({
      apiKey,
      input: 'hello',
      model: 'text-embedding-3-small',
      fetchImpl: fetchSpy as any,
    })
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const call = (fetchSpy as any).mock.calls[0] as any
    const url = String(call?.[0])
    const init = call?.[1] as any
    expect(url).toMatch('https://api.openai.com/v1/embeddings')
    const body = JSON.parse(String(init?.body))
    expect(body).toMatchObject({ input: 'hello', model: 'text-embedding-3-small' })
    expect(res).toEqual([0.1, 0.2])
  })

  it('calls chat completions with messages', async () => {
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: '안녕하세요' } }] }), { status: 200 }))
    const content = await chatComplete({
      apiKey: 'sk',
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'hi' }],
      fetchImpl: fetchSpy as any,
    })
    expect(fetchSpy).toHaveBeenCalled()
    expect(content).toBe('안녕하세요')
  })
})

describe('qdrant adapter', () => {
  it('POSTs /points/search with vector and limit', async () => {
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ result: [{ id: 'a', score: 0.9, payload: { title: 't', content: 'test content', link: 'https://example.com' } }] }), { status: 200 }))
    const hits = await qdrantSearch({
      url: 'https://qdrant.example',
      apiKey: 'qk',
      collection: 'knue-regs',
      vector: [0.1, 0.2],
      limit: 5,
      fetchImpl: fetchSpy as any,
    })
    expect(fetchSpy).toHaveBeenCalled()
    
    // Verify request body includes required payload fields
    const call = fetchSpy.mock.calls[0] as unknown as [string, RequestInit]
    const requestBody = JSON.parse(call[1].body as string)
    expect(requestBody.with_payload.include).toEqual(['title', 'content', 'preview_url', 'link'])
    
    expect(hits.length).toBe(1)
    expect(hits[0].score).toBe(0.9)
    expect(hits[0].payload?.link).toBe('https://example.com')
  })
})
