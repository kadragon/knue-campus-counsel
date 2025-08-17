import { loadConfig } from './config'
import { createEnhancedRag } from './rag'
import { sendMessage, sendChatAction, editMessageText } from './telegram'
import { renderMarkdownToTelegramHTML as toTgHTML, splitTelegramMessage } from './utils'

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

  if (request.method === 'POST' && url.pathname === '/kakao') {
    return handleKakaoRequest(request, env)
  }

  if (request.method === 'POST' && url.pathname === '/telegram/webhook') {
    if (!validateWebhookSecret(request, env)) {
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
        await sendMessage({ chatId, text: toTgHTML(reply), botToken: cfg.telegram.botToken })
        return new Response(null, { status: 200 })
      }

      // Perceived latency: show typing and placeholder message
      await sendChatAction({ chatId, action: 'typing', botToken: cfg.telegram.botToken })
      const pendingMsg = await sendMessage({ chatId, text: toTgHTML('답변 생성 중…'), botToken: cfg.telegram.botToken })
      const pendingId: number | undefined = pendingMsg?.message_id

      console.log('Calling RAG with text:', text)
      console.log('Using model:', cfg.chatModel)
      const result = await getRagAnswer(text, cfg)
      const full = `${result.answer}`
      const chunks = splitTelegramMessage(toTgHTML(full), 4096)
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

function validateWebhookSecret(request: Request, env: Env): boolean {
  const telegramSecret = request.headers.get('X-Telegram-Bot-Api-Secret-Token')
  const kakaoSecret = request.headers.get('X-Kakao-Webhook-Secret-Token')
  
  const secret = telegramSecret || kakaoSecret
  return secret === env.WEBHOOK_SECRET_TOKEN
}

async function getRagAnswer(question: string, cfg: any) {
  const rag = await createEnhancedRag({
    openaiApiKey: cfg.openaiApiKey,
    qdrantUrl: cfg.qdrant.url,
    qdrantApiKey: cfg.qdrant.apiKey,
    qdrantCollection: cfg.qdrant.collection,
    boardCollection: 'www-board-data',
    model: cfg.chatModel,
    boardTopK: cfg.rag.boardTopK,
    policyTopK: cfg.rag.policyTopK,
  })
  return await rag(question)
}

async function handleKakaoRequest(request: Request, env: Env): Promise<Response> {
  try {
    // 웹훅 시크릿 토큰 검증
    if (!validateWebhookSecret(request, env)) {
      return new Response(
        JSON.stringify({
          version: "2.0",
          template: {
            outputs: [{
              simpleText: {
                text: "인증에 실패했습니다."
              }
            }]
          }
        }),
        { 
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        }
      )
    }

    const body = await request.json() as KakaoRequest
    const question = body?.action?.params?.question?.trim() || body?.userRequest?.utterance?.trim()

    if (!question) {
      return new Response(
        JSON.stringify({
          version: "2.0",
          template: {
            outputs: [{
              simpleText: {
                text: "질문을 입력해주세요."
              }
            }]
          }
        }),
        { 
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }
      )
    }

    const cfg = loadConfig(env)
    const result = await getRagAnswer(question, cfg)
    
    return new Response(
      JSON.stringify({
        version: "2.0",
        template: {
          outputs: [{
            simpleText: {
              text: result.answer
            }
          }]
        }
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    )
  } catch (error) {
    console.error('Kakao API error:', error)
    return new Response(
      JSON.stringify({
        version: "2.0",
        template: {
          outputs: [{
            simpleText: {
              text: "일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요."
            }
          }]
        }
      }),
      { 
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    )
  }
}

interface KakaoRequest {
  intent?: {
    id: string
    name: string
  }
  userRequest?: {
    timezone: string
    params?: any
    block?: {
      id: string
      name: string
    }
    utterance?: string
    lang?: string | null
    user?: {
      id: string
      type: string
      properties?: any
    }
  }
  bot?: {
    id: string
    name: string
  }
  action?: {
    name: string
    clientExtra?: any
    params?: {
      question?: string
      [key: string]: any
    }
    id: string
    detailParams?: any
  }
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
