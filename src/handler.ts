import { loadConfig } from './config'
import { createEnhancedRag, createEnhancedRagStream } from './rag'
import { sendMessage, sendChatAction, editMessageText, handleSmartStreaming } from './telegram'
import { renderMarkdownToTelegramHTML as toTgHTML, splitTelegramMessage, allowRequest } from './utils'

export interface Env {
  OPENAI_API_KEY: string
  QDRANT_URL?: string
  QDRANT_CLOUD_URL?: string
  QDRANT_API_KEY: string
  QDRANT_COLLECTION?: string
  COLLECTION_NAME?: string
  TELEGRAM_BOT_TOKEN: string
  WEBHOOK_SECRET_TOKEN: string
  ALLOWED_USER_IDS?: string
  LOG_LEVEL?: 'info' | 'debug' | 'error'
  OPENAI_CHAT_MODEL?: string
}

export async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)

  if (request.method === 'GET' && url.pathname === '/healthz') {
    return new Response('ok')
  }

  if (request.method === 'POST' && url.pathname === '/ask') {
    return handleAskRequest(request, env)
  }


  if (request.method === 'POST' && url.pathname === '/telegram') {
    if (!validateTelegramWebhookSecret(request, env)) {
      console.error('Webhook secret validation failed')
      return new Response('unauthorized', { status: 401 })
    }
    // Minimal acceptance: parse body to ensure JSON
    try {
      const update = await request.json() as any
      const cfg = loadConfig(env)
      if (cfg.logLevel === 'debug') {
        console.log('Received webhook update:', JSON.stringify(update, null, 2))
      }
      
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

      // rate limiting per user
      const rlKey = fromId ? `tg:${fromId}` : (chatId ? `tg-chat:${chatId}` : 'tg:unknown')
      const rl = allowRequest(rlKey, cfg.rateLimit.windowMs, cfg.rateLimit.max)
      if (!rl.allowed) {
        if (cfg.logLevel === 'debug') console.log('Rate limited:', rlKey, rl)
        // avoid extra messages; silently drop
        return new Response(null, { status: 204, headers: { 'Retry-After': String(rl.retryAfterSec) } })
      }

      // simple commands
      if (text === '/start' || text === '/help') {
        const reply = '안녕하세요! 규정/지침 근거 기반으로 답변해 드립니다. 질문을 보내주세요.'
        await sendMessage({ chatId, text: toTgHTML(reply), botToken: cfg.telegram.botToken })
        return new Response(null, { status: 200 })
      }

      // 스마트 스트리밍 응답 사용
      if (cfg.logLevel === 'debug') {
        console.log('Calling RAG Stream with text:', text)
        console.log('Using model:', cfg.chatModel)
      }
      
      try {
        const ragStream = await getRagAnswerStream(text, cfg)
        await handleSmartStreaming({
          chatId,
          botToken: cfg.telegram.botToken,
          ragStream
        })
      } catch (error) {
        console.error('Streaming failed, falling back to regular response:', error)
        // 스트리밍 실패 시 기존 방식으로 폴백
        await sendChatAction({ chatId, action: 'typing', botToken: cfg.telegram.botToken })
        const pendingMsg = await sendMessage({ chatId, text: toTgHTML('답변 생성 중…'), botToken: cfg.telegram.botToken })
        const pendingId: number | undefined = pendingMsg?.message_id

        const result = await getRagAnswer(text, cfg)
        const full = `${result.answer}`
        const chunks = splitTelegramMessage(toTgHTML(full), 4096)
        if (pendingId && chunks.length) {
          try {
            await editMessageText({ chatId, messageId: pendingId, text: chunks[0], botToken: cfg.telegram.botToken })
          } catch (e) {
            // Fallback: send as a new message if edit fails
            await sendMessage({ chatId, text: chunks[0], botToken: cfg.telegram.botToken })
          }
          for (const c of chunks.slice(1)) {
            await sendMessage({ chatId, text: c, botToken: cfg.telegram.botToken })
          }
        } else {
          for (const c of chunks) {
            await sendMessage({ chatId, text: c, botToken: cfg.telegram.botToken })
          }
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

function validateTelegramWebhookSecret(request: Request, env: Env): boolean {
  const telegramSecret = request.headers.get('X-Telegram-Bot-Api-Secret-Token')
  return telegramSecret === env.WEBHOOK_SECRET_TOKEN
}

function validateWebhookSecret(request: Request, env: Env): boolean {
  const webhookSecret = request.headers.get('X-Webhook-Secret-Token')
  return webhookSecret === env.WEBHOOK_SECRET_TOKEN
}

async function getRagAnswer(question: string, cfg: any) {
  const rag = await createEnhancedRag({
    openaiApiKey: cfg.openaiApiKey,
    qdrantUrl: cfg.qdrant.url,
    qdrantApiKey: cfg.qdrant.apiKey,
    qdrantCollection: cfg.qdrant.collection,
    boardCollection: cfg.qdrant.boardCollection,
    model: cfg.chatModel,
    boardTopK: cfg.rag.boardTopK,
    policyTopK: cfg.rag.policyTopK,
  })
  return await rag(question)
}

async function getRagAnswerStream(question: string, cfg: any) {
  const ragStream = await createEnhancedRagStream({
    openaiApiKey: cfg.openaiApiKey,
    qdrantUrl: cfg.qdrant.url,
    qdrantApiKey: cfg.qdrant.apiKey,
    qdrantCollection: cfg.qdrant.collection,
    boardCollection: cfg.qdrant.boardCollection,
    model: cfg.chatModel,
    boardTopK: cfg.rag.boardTopK,
    policyTopK: cfg.rag.policyTopK,
  })
  return ragStream(question)
}


async function handleAskRequest(request: Request, env: Env): Promise<Response> {
  try {
    // 웹훅 시크릿 토큰 검증
    if (!validateWebhookSecret(request, env)) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { 
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        }
      )
    }

    const body = await request.json() as { question: string }
    const question = body?.question?.trim()

    if (!question) {
      return new Response(
        JSON.stringify({ error: 'Question is required' }),
        { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      )
    }

    const cfg = loadConfig(env)
    const result = await getRagAnswer(question, cfg)
    
    return new Response(
      JSON.stringify({
        answer: result.answer,
        references: result.refs
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    )
  } catch (error) {
    console.error('Ask API error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    )
  }
}

export default {
  fetch: handleRequest,
}
