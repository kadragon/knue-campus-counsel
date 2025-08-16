import { loadConfig } from './config'
import { createDefaultRag } from './rag'
import { sendMessage } from './telegram'
import { escapeHtml, splitTelegramMessage } from './utils'

export interface Env {
  OPENAI_API_KEY: string
  QDRANT_URL?: string
  QDRANT_CLOUD_URL?: string
  QDRANT_API_KEY: string
  QDRANT_COLLECTION?: string
  COLLECTION_NAME?: string
  TELEGRAM_BOT_TOKEN: string
  TELEGRAM_WEBHOOK_SECRET_TOKEN: string
  ALLOWED_USER_IDS?: string
  LOG_LEVEL?: 'info' | 'debug' | 'error'
  OPENAI_CHAT_MODEL?: string
}

export async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)

  if (request.method === 'GET' && url.pathname === '/healthz') {
    return new Response('ok')
  }

  if (request.method === 'POST' && url.pathname === '/telegram/webhook') {
    const secret = request.headers.get('X-Telegram-Bot-Api-Secret-Token')
    if (!secret || secret !== env.TELEGRAM_WEBHOOK_SECRET_TOKEN) {
      return new Response('unauthorized', { status: 401 })
    }
    // Minimal acceptance: parse body to ensure JSON
    try {
      const update = await request.json() as any
      const cfg = loadConfig(env)
      const msg = update?.message
      const text: string | undefined = msg?.text
      const chatId: number | undefined = msg?.chat?.id
      const fromId: number | undefined = msg?.from?.id

      if (!text || !chatId) {
        return new Response(null, { status: 204 })
      }

      // whitelist check
      if (cfg.allowedUserIds && fromId && !cfg.allowedUserIds.has(fromId)) {
        return new Response(null, { status: 204 })
      }

      // simple commands
      if (text === '/start' || text === '/help') {
        const reply = '안녕하세요! 규정/지침 근거 기반으로 답변해 드립니다. 질문을 보내주세요.'
        await sendMessage({ chatId, text: escapeHtml(reply), botToken: cfg.telegram.botToken })
        return new Response(null, { status: 200 })
      }

      const rag = createDefaultRag({
        openaiApiKey: cfg.openaiApiKey,
        qdrantUrl: cfg.qdrant.url,
        qdrantApiKey: cfg.qdrant.apiKey,
        qdrantCollection: cfg.qdrant.collection,
        model: cfg.chatModel,
      })
      const result = await rag(text)
      const footer = result.refs.length
        ? ['\n\n—\n참조:', ...result.refs.map((r) => `• ${r.title ?? '무제'} | ${r.url ?? ''}`)].join('\n')
        : ''
      const full = `${result.answer}${footer}`
      const chunks = splitTelegramMessage(escapeHtml(full), 4096)
      for (const c of chunks) {
        await sendMessage({ chatId, text: c, botToken: cfg.telegram.botToken })
      }
      return new Response(null, { status: 200 })
    } catch {
      return new Response('bad request', { status: 400 })
    }
  }

  return new Response('not found', { status: 404 })
}

export default {
  fetch: handleRequest,
}
