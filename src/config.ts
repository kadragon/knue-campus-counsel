import type { Env } from './handler'

export type AppConfig = {
  openaiApiKey: string
  qdrant: { url: string; apiKey: string; collection: string }
  telegram: { botToken: string; webhookSecret: string }
  allowedUserIds: Set<number> | undefined
  logLevel: 'info' | 'debug' | 'error'
  chatModel: string
}

export function loadConfig(env: Env): AppConfig {
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
  if (!qdrantUrl) throw new Error('Missing QDRANT_URL or QDRANT_CLOUD_URL')
  if (!collection) throw new Error('Missing QDRANT_COLLECTION or COLLECTION_NAME')
  const chatModel = (env as any).OPENAI_CHAT_MODEL || 'gpt-4.1-mini'
  return {
    openaiApiKey: env.OPENAI_API_KEY,
    qdrant: {
      url: qdrantUrl,
      apiKey: env.QDRANT_API_KEY,
      collection,
    },
    telegram: {
      botToken: env.TELEGRAM_BOT_TOKEN,
      webhookSecret: env.TELEGRAM_WEBHOOK_SECRET_TOKEN || '',
    },
    allowedUserIds,
    logLevel: log,
    chatModel,
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
