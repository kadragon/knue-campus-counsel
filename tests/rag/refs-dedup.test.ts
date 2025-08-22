import { describe, it, expect, vi } from 'vitest'
import { buildRag } from '../../src/rag/rag'

describe('RAG refs dedup and threshold behavior', () => {
  it('deduplicates same title+url and keeps order', async () => {
    const embed = vi.fn(async () => [0.1])
    const search = vi.fn(async () => [
      { id: 'a', score: 0.9, title: 'T', content: 'c1', link: 'u', sourceType: 'policy' as const },
      { id: 'b', score: 0.8, title: 'T', content: 'c2', link: 'u', sourceType: 'board' as const },
      { id: 'c', score: 0.7, title: 'X', content: 'c3', link: 'v', sourceType: 'policy' as const },
    ])
    const chat = vi.fn(async () => 'ans')
    const rag = buildRag({ embed: embed as any, search: search as any, chat: chat as any, model: 'm', topK: 3, scoreThreshold: 0.2 })
    const res = await rag('q')
    expect(res.refs).toEqual([
      { title: 'T', url: 'u' },
      { title: 'X', url: 'v' },
    ])
  })

  it('keeps items at exact threshold and drops below', async () => {
    const embed = vi.fn(async () => [0.1])
    const search = vi.fn(async () => [
      { id: 'a', score: 0.5, title: 'A', content: 'c', link: 'a', sourceType: 'policy' as const },
      { id: 'b', score: 0.49, title: 'B', content: 'c', link: 'b', sourceType: 'board' as const },
    ])
    const chat = vi.fn(async () => 'ans')
    const rag = buildRag({ embed: embed as any, search: search as any, chat: chat as any, model: 'm', topK: 2, scoreThreshold: 0.5 })
    const res = await rag('q')
    expect(res.refs).toEqual([{ title: 'A', url: 'a' }])
  })
})

