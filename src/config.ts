import type { Env } from './types.js'
import type { RateLimitConfig } from './rate-limit/types.js'
import { assertValidEnv } from './env-validation.js'

export type AppConfig = {
  openaiApiKey: string
  qdrant: { url: string; apiKey: string; collection: string; boardCollection: string }
  telegram: { botToken: string; webhookSecret: string }
  allowedUserIds: Set<number> | undefined
  logLevel: 'info' | 'debug' | 'error'
  chatModel: string
  rag: { boardTopK: number; policyTopK: number }
  rateLimit: { windowMs: number; max: number }
  rateLimitKV: RateLimitConfig
}

export function loadConfig(env: Env): AppConfig {
  // Extended validation with actionable errors
  assertValidEnv(env)
  const required = [
    'OPENAI_API_KEY',
    // QDRANT_URL 또는 QDRANT_CLOUD_URL 중 하나 필요
    'QDRANT_API_KEY',
    // QDRANT_COLLECTION 또는 COLLECTION_NAME 중 하나 필요
    'TELEGRAM_BOT_TOKEN',
    // 'TELEGRAM_WEBHOOK_SECRET_TOKEN', // Optional for now
  ] as const

  const missing = required.filter((k) => !(env as any)[k])
  if (missing.length) {
    throw new Error(`Missing required envs: ${missing.join(', ')}`)
  }

  const allowedUserIds = parseAllowed(env.ALLOWED_USER_IDS)
  const log = (env.LOG_LEVEL as any) || 'info'
  const qdrantUrl = (env as any).QDRANT_URL || (env as any).QDRANT_CLOUD_URL
  const collection = (env as any).QDRANT_COLLECTION || (env as any).COLLECTION_NAME
  const boardCollection = (env as any).BOARD_COLLECTION || 'www-board-data'
  if (!qdrantUrl) throw new Error('Missing QDRANT_URL or QDRANT_CLOUD_URL')
  if (!collection) throw new Error('Missing QDRANT_COLLECTION or COLLECTION_NAME')
  const chatModel = (env as any).OPENAI_CHAT_MODEL || 'gpt-4.1-mini'
  const boardTopK = parseInt((env as any).BOARD_COLLECTION_TOP_K || '5', 10)
  const policyTopK = parseInt((env as any).POLICY_COLLECTION_TOP_K || '3', 10)
  const rlWindowMs = parseInt((env as any).RATE_LIMIT_WINDOW_MS || '5000', 10)
  const rlMax = parseInt((env as any).RATE_LIMIT_MAX || '1', 10)
  
  // KV 기반 레이트 리밋 설정
  const rateLimitKV: RateLimitConfig = {
    windowMs: rlWindowMs,
    max: rlMax,
    kvEnabled: (env as any).RATE_LIMIT_KV_ENABLED === 'true',
    // Prefer KV_* envs with legacy fallback to non-KV names
    memoryCacheSize: parseInt(
      (env as any).RATE_LIMIT_KV_MEMORY_CACHE_SIZE ?? (env as any).RATE_LIMIT_MEMORY_CACHE_SIZE ?? '1000',
      10,
    ),
    memoryCacheTTL: parseInt(
      (env as any).RATE_LIMIT_KV_MEMORY_CACHE_TTL ?? (env as any).RATE_LIMIT_MEMORY_CACHE_TTL ?? '300000',
      10,
    ),
    cleanupThreshold: parseInt(
      (env as any).RATE_LIMIT_KV_CLEANUP_THRESHOLD ?? (env as any).RATE_LIMIT_CLEANUP_THRESHOLD ?? '3600000',
      10,
    ),
    cleanupInterval: parseInt(
      (env as any).RATE_LIMIT_KV_CLEANUP_INTERVAL ?? (env as any).RATE_LIMIT_CLEANUP_INTERVAL ?? '3600000',
      10,
    ),
    adaptiveEnabled:
      (env as any).RATE_LIMIT_KV_ADAPTIVE_ENABLED === 'true' ||
      (env as any).RATE_LIMIT_ADAPTIVE_ENABLED === 'true',
  }
  
  return {
    openaiApiKey: env.OPENAI_API_KEY,
    qdrant: {
      url: qdrantUrl,
      apiKey: env.QDRANT_API_KEY,
      collection,
      boardCollection,
    },
    telegram: {
      botToken: env.TELEGRAM_BOT_TOKEN,
      webhookSecret: env.WEBHOOK_SECRET_TOKEN || '',
    },
    allowedUserIds,
    logLevel: log,
    chatModel,
    rag: {
      boardTopK,
      policyTopK,
    },
    rateLimit: { windowMs: rlWindowMs, max: rlMax },
    rateLimitKV,
  }
}

function parseAllowed(ids?: string): Set<number> | undefined {
  if (!ids) return undefined
  const arr = ids
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => Number(s))
    .filter((n) => Number.isFinite(n))
  return arr.length ? new Set(arr) : undefined
}
