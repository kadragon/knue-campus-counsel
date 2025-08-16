import { loadConfig } from './config'
import { createDefaultRag } from './rag'
import { sendMessage, sendChatAction, editMessageText } from './telegram'
import { renderMarkdownToTelegramV2 as toTgMDV2, splitTelegramMessage } from './utils'

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
    console.log('Received secret:', secret)
    console.log('Expected secret:', env.TELEGRAM_WEBHOOK_SECRET_TOKEN)
    console.log('Secret length:', env.TELEGRAM_WEBHOOK_SECRET_TOKEN?.length || 0)
    if (!secret || secret !== env.TELEGRAM_WEBHOOK_SECRET_TOKEN) {
      console.error('Webhook secret validation failed')
      return new Response('unauthorized', { status: 401 })
    }
    // Minimal acceptance: parse body to ensure JSON
    try {
      const update = await request.json() as any
      console.log('Received webhook update:', JSON.stringify(update, null, 2))
      
      const cfg = loadConfig(env)
      const msg = update?.message
      const text: string | undefined = msg?.text
      const chatId: number | undefined = msg?.chat?.id
      const fromId: number | undefined = msg?.from?.id
      const isFromBot: boolean = Boolean(msg?.from?.is_bot)

      // Ignore non-message updates and bot/self messages to prevent loops and duplicates
      if (!msg || isFromBot || !text || !chatId) {
        console.log('No text or chatId found, ignoring')
        return new Response(null, { status: 204 })
      }

      // whitelist check
      if (cfg.allowedUserIds && fromId && !cfg.allowedUserIds.has(fromId)) {
        return new Response(null, { status: 204 })
      }

      // simple commands
      if (text === '/start' || text === '/help') {
        const reply = '안녕하세요! 규정/지침 근거 기반으로 답변해 드립니다. 질문을 보내주세요.'
        await sendMessage({ chatId, text: toTgMDV2(reply), botToken: cfg.telegram.botToken })
        return new Response(null, { status: 200 })
      }

      // Perceived latency: show typing and placeholder message
      await sendChatAction({ chatId, action: 'typing', botToken: cfg.telegram.botToken })
      const pendingMsg = await sendMessage({ chatId, text: toTgMDV2('답변 생성 중…'), botToken: cfg.telegram.botToken })
      const pendingId: number | undefined = pendingMsg?.message_id

      const rag = createDefaultRag({
        openaiApiKey: cfg.openaiApiKey,
        qdrantUrl: cfg.qdrant.url,
        qdrantApiKey: cfg.qdrant.apiKey,
        qdrantCollection: cfg.qdrant.collection,
        model: cfg.chatModel,
      })
      console.log('Calling RAG with text:', text)
      console.log('Using model:', cfg.chatModel)
      const result = await rag(text)
      const full = `${result.answer}`
      const chunks = splitTelegramMessage(toTgMDV2(full), 4096)
      if (pendingId && chunks.length) {
        await editMessageText({ chatId, messageId: pendingId, text: chunks[0], botToken: cfg.telegram.botToken })
        for (const c of chunks.slice(1)) {
          await sendMessage({ chatId, text: c, botToken: cfg.telegram.botToken })
        }
      } else {
        for (const c of chunks) {
          await sendMessage({ chatId, text: c, botToken: cfg.telegram.botToken })
        }
      }
      return new Response(null, { status: 200 })
    } catch (error) {
      console.error('Webhook processing error:', error)
      return new Response('bad request', { status: 400 })
    }
  }

  return new Response('not found', { status: 404 })
}

export default {
  fetch: handleRequest,
}
