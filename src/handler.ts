import { loadConfig } from './config'
import { createEnhancedRag } from './rag'
import { sendMessage, sendChatAction, editMessageText, handleProgressiveStatus } from './telegram'
import { renderMarkdownToTelegramHTML as toTgHTML, splitTelegramMessage, allowRequest } from './utils'
import { initializeRateLimiter, checkRateLimit, getRateLimiterStats } from './rate-limit/index.js'
import { CloudflareKVStore } from './rate-limit/kv-store.js'
import { getMetrics } from './metrics-registry.js'
import type { Env } from './types.js'

export async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  const cfg = loadConfig(env)

  // Initialize rate limiter if KV is available and enabled
  if (env.RATE_LIMIT_KV && cfg.rateLimitKV.kvEnabled) {
    initializeRateLimiter(env.RATE_LIMIT_KV, cfg.rateLimitKV)
  }

  if (request.method === 'GET' && url.pathname === '/healthz') {
    const started = Date.now()
    const kvEnabled = Boolean(env.RATE_LIMIT_KV) && cfg.rateLimitKV.kvEnabled
    const kvStatus: any = { enabled: kvEnabled }

    if (kvEnabled) {
      try {
        const kv = new CloudflareKVStore(env.RATE_LIMIT_KV, 'info')
        const key = `health:v1:${Date.now()}:${Math.random().toString(36).slice(2)}`
        const now = Date.now()
        // Use RateLimitRecord-like object for compatibility with MockKVStore
        const value = { timestamps: [now], windowMs: 1, maxRequests: 1, lastAccess: now }
        await kv.put(key, value, 10)
        const got = await kv.get(key)
        // Best-effort cleanup when available
        try { await (env.RATE_LIMIT_KV as any)?.delete?.(key) } catch {}
        kvStatus.ok = Boolean(got)
        kvStatus.roundTripMs = Date.now() - started
        if (!kvStatus.ok) {
          kvStatus.error = 'KV roundtrip failed'
        }
      } catch (error) {
        kvStatus.ok = false
        kvStatus.error = error instanceof Error ? error.message : String(error)
      }
    }

    const rateLimiter = getRateLimiterStats()
    const body = {
      status: 'ok',
      kv: kvStatus,
      rateLimiter,
      metrics: getMetrics().snapshot(),
    }
    return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } })
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
      
      let rl: { allowed: boolean; retryAfterSec: number }
      
      // Use KV-based rate limiting if available and enabled
      if (env.RATE_LIMIT_KV && cfg.rateLimitKV.kvEnabled) {
        try {
          const result = await checkRateLimit(
            rlKey, 
            cfg.rateLimitKV.windowMs, 
            cfg.rateLimitKV.max,
            {
              userAgent: request.headers.get('user-agent'),
              endpoint: 'telegram'
            }
          )
          rl = { allowed: result.allowed, retryAfterSec: result.retryAfterSec }
          
          if (cfg.logLevel === 'debug') {
            console.log('KV rate limit check:', rlKey, {
              allowed: result.allowed,
              remaining: result.remaining,
              source: result.metadata?.source
            })
          }
        } catch (error) {
          // Fallback to memory-based rate limiting
          console.warn('KV rate limiting failed, falling back to memory:', error)
          rl = allowRequest(rlKey, cfg.rateLimit.windowMs, cfg.rateLimit.max)
        }
      } else {
        // Use original memory-based rate limiting
        rl = allowRequest(rlKey, cfg.rateLimit.windowMs, cfg.rateLimit.max)
      }
      
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

      // 단계별 상태 표시와 함께 답변 생성
      if (cfg.logLevel === 'debug') {
        console.log('Calling RAG with text:', text)
        console.log('Using model:', cfg.chatModel)
      }
      
      try {
        await handleProgressiveStatus({
          chatId,
          botToken: cfg.telegram.botToken,
          ragFunction: () => getRagAnswer(text, cfg)
        })
      } catch (error) {
        console.error('Progressive status handling failed, falling back to simple response:', error)
        // 에러 발생 시 간단한 에러 메시지만 전송
        await sendMessage({ 
          chatId, 
          text: '❌ 죄송합니다. 일시적인 오류가 발생했습니다. 잠시 후 다시 시도해주세요.', 
          botToken: cfg.telegram.botToken 
        })
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
