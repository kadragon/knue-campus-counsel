import { createEmbedding, chatComplete } from './openai'
import { qdrantSearch, QdrantHit } from './qdrant'

type EmbedFn = (q: string) => Promise<number[]>
type SearchFn = (v: number[]) => Promise<QdrantHit[]>
type ChatFn = (prompt: { system: string; user: string; context: string }) => Promise<string>

export function buildRag(opts: {
  embed: EmbedFn
  search: SearchFn
  chat: ChatFn
  model: string
  topK: number
  scoreThreshold: number
}) {
  const { embed, search, chat, scoreThreshold } = opts
  return async function orchestrate(query: string): Promise<{ answer: string; refs: { title?: string; url?: string }[] }> {
    const v = await embed(preprocess(query))
    const hits = await search(v)
    const filtered = hits.filter((h) => typeof h.score === 'number' && h.score >= scoreThreshold)
    if (!filtered.length) {
      return { answer: '문서에서 해당 근거를 찾지 못했습니다.', refs: [] }
    }
    const context = formatContext(filtered)
    const system = '너는 한국교원대학교 규정/지침에만 근거해 답변한다. 반드시 출처를 포함하고, 추측하지 않는다.'
    const user = query
    const content = await chat({ system, user, context })
    const refs = dedupeRefs(filtered)
    return { answer: content, refs }
  }
}

export function createDefaultRag(cfg: {
  openaiApiKey: string
  qdrantUrl: string
  qdrantApiKey: string
  qdrantCollection: string
  model: string
  topK?: number
  scoreThreshold?: number
}) {
  const topK = cfg.topK ?? 6
  const scoreThreshold = cfg.scoreThreshold ?? 0.2
  const embed: EmbedFn = (q) => createEmbedding({ apiKey: cfg.openaiApiKey, input: q, model: 'text-embedding-3-large' })
  const search: SearchFn = (v) => qdrantSearch({ url: cfg.qdrantUrl, apiKey: cfg.qdrantApiKey, collection: cfg.qdrantCollection, vector: v, limit: topK, scoreThreshold })
  const chat: ChatFn = async ({ system, user, context }) =>
    chatComplete({ apiKey: cfg.openaiApiKey, model: cfg.model, messages: [
      { role: 'system', content: system },
      { role: 'user', content: buildUserMessage(user, context) },
    ] })
  return buildRag({ embed, search, chat, model: cfg.model, topK, scoreThreshold })
}

function preprocess(q: string): string {
  return q.trim().slice(0, 2000)
}

function formatContext(hits: QdrantHit[]): string {
  const parts = hits.map((h, i) => {
    const p = (h.payload as any) || {}
    const title = p.title || '무제'
    const chunk = p.chunk_text || ''
    const article = p.article_no ? `제${p.article_no}조` : ''
    return `[#${i + 1}] ${title} ${article}\n${chunk}`
  })
  return parts.join('\n\n')
}

function buildUserMessage(user: string, context: string): string {
  return `사용자 질의:\n${user}\n\n근거 후보:\n${context}\n\n규정/지침에 근거해 답변하고 마지막에 출처를 목록으로 제시하세요.`
}

function dedupeRefs(hits: QdrantHit[]): { title?: string; url?: string }[] {
  const set = new Set<string>()
  const out: { title?: string; url?: string }[] = []
  for (const h of hits) {
    const p = (h.payload as any) || {}
    const key = `${p.title}|${p.url}`
    if (set.has(key)) continue
    set.add(key)
    out.push({ title: p.title, url: p.url })
  }
  return out
}

