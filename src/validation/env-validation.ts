import type { Env } from '../core/types.js'

export type EnvIssue = { type: 'error' | 'warning'; field: string; message: string }

export type EnvValidationResult = {
  ok: boolean
  errors: EnvIssue[]
  warnings: EnvIssue[]
}

export function validateEnv(env: Env): EnvValidationResult {
  const errors: EnvIssue[] = []
  const warnings: EnvIssue[] = []

  // Required secrets
  if (!env.OPENAI_API_KEY) errors.push({ type: 'error', field: 'OPENAI_API_KEY', message: 'required' })
  if (!env.QDRANT_API_KEY) errors.push({ type: 'error', field: 'QDRANT_API_KEY', message: 'required' })
  if (!env.TELEGRAM_BOT_TOKEN) errors.push({ type: 'error', field: 'TELEGRAM_BOT_TOKEN', message: 'required' })

  // Qdrant URL and collection
  const qdrantUrl = (env as any).QDRANT_URL || (env as any).QDRANT_CLOUD_URL
  const collection = (env as any).QDRANT_COLLECTION || (env as any).COLLECTION_NAME
  if (!qdrantUrl) errors.push({ type: 'error', field: 'QDRANT_URL|QDRANT_CLOUD_URL', message: 'one of these is required' })
  if (!collection) errors.push({ type: 'error', field: 'QDRANT_COLLECTION|COLLECTION_NAME', message: 'one of these is required' })

  // Optional but recommended webhook secret
  if (!env.WEBHOOK_SECRET_TOKEN) {
    warnings.push({ type: 'warning', field: 'WEBHOOK_SECRET_TOKEN', message: 'missing; /ask and /telegram webhook protection recommended' })
  }

  // Numeric bounds and sanity checks
  const num = (v: any) => (v === undefined || v === null || v === '' ? undefined : Number.parseInt(String(v), 10))

  const boardTopK = num((env as any).BOARD_COLLECTION_TOP_K)
  const policyTopK = num((env as any).POLICY_COLLECTION_TOP_K)
  if (boardTopK !== undefined && (!Number.isFinite(boardTopK) || boardTopK < 1 || boardTopK > 50)) {
    errors.push({ type: 'error', field: 'BOARD_COLLECTION_TOP_K', message: 'must be an integer between 1 and 50' })
  }
  if (policyTopK !== undefined && (!Number.isFinite(policyTopK) || policyTopK < 1 || policyTopK > 50)) {
    errors.push({ type: 'error', field: 'POLICY_COLLECTION_TOP_K', message: 'must be an integer between 1 and 50' })
  }

  const windowMs = num((env as any).RATE_LIMIT_WINDOW_MS)
  const max = num((env as any).RATE_LIMIT_MAX)
  if (windowMs !== undefined && (!Number.isFinite(windowMs) || windowMs < 100 || windowMs > 3600000)) {
    errors.push({ type: 'error', field: 'RATE_LIMIT_WINDOW_MS', message: 'must be an integer between 100 and 3600000' })
  }
  if (max !== undefined && (!Number.isFinite(max) || max < 0 || max > 1000)) {
    errors.push({ type: 'error', field: 'RATE_LIMIT_MAX', message: 'must be an integer between 0 and 1000' })
  }

  const memorySize = num((env as any).RATE_LIMIT_MEMORY_CACHE_SIZE)
  const memoryTTL = num((env as any).RATE_LIMIT_MEMORY_CACHE_TTL)
  if (memorySize !== undefined && (!Number.isFinite(memorySize) || memorySize < 0 || memorySize > 100000)) {
    errors.push({ type: 'error', field: 'RATE_LIMIT_MEMORY_CACHE_SIZE', message: 'must be an integer between 0 and 100000' })
  }
  if (memoryTTL !== undefined && (!Number.isFinite(memoryTTL) || memoryTTL < 1 || memoryTTL > 86400000)) {
    errors.push({ type: 'error', field: 'RATE_LIMIT_MEMORY_CACHE_TTL', message: 'must be an integer between 1 and 86400000' })
  }

  return { ok: errors.length === 0, errors, warnings }
}

export function assertValidEnv(env: Env): void {
  const result = validateEnv(env)
  if (!result.ok) {
    const details = result.errors.map(e => `${e.field}: ${e.message}`).join('; ')
    throw new Error(`Invalid environment configuration: ${details}`)
  }
}

