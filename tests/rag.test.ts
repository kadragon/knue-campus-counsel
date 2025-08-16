import { describe, it, expect, vi } from 'vitest'
import { buildRag } from '../src/rag'

describe('rag.orchestrate', () => {
  it('returns 근거 없음 when no hits', async () => {
    const embedding = vi.fn(async () => [0.1, 0.2])
    const search = vi.fn(async () => [])
    const chat = vi.fn(async () => 'irrelevant')
    const rag = buildRag({
      embed: embedding as any,
      search: search as any,
      chat: chat as any,
      model: 'gpt-4o-mini',
      topK: 5,
      scoreThreshold: 0.2,
    })
    const res = await rag('학칙 졸업 요건 알려줘')
    expect(res.answer).toMatch(/근거를 찾지 못했/)
    expect(chat).not.toHaveBeenCalled()
  })

  it('invokes chat with context when hits exist', async () => {
    const embedding = vi.fn(async () => [0.1, 0.2])
    const search = vi.fn(async () => [
      { id: 'd1#1', score: 0.9, payload: { title: '학칙', url: 'https://u.ac.kr/reg1', chunk_text: '졸업 학점은 130학점 이상' } },
    ])
    const chat = vi.fn(async () => '졸업 요건은 130학점 이상입니다.')
    const rag = buildRag({ embed: embedding as any, search: search as any, chat: chat as any, model: 'gpt-4o-mini', topK: 5, scoreThreshold: 0.2 })
    const res = await rag('졸업 요건 알려줘')
    expect(chat).toHaveBeenCalled()
    expect(res.answer).toMatch(/130학점/)
    expect(res.refs.length).toBe(1)
  })
})

