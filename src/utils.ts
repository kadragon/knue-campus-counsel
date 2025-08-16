import type { LogEntry } from './types'

export function escapeMarkdownV2(input: string): string {
  // MarkdownV2에서 이스케이프가 필요한 특수 문자들
  return input
    .replace(/\\/g, '\\\\')  // 백슬래시
    .replace(/_/g, '\\_')    // 언더스코어
    .replace(/\*/g, '\\*')   // 별표
    .replace(/\[/g, '\\[')   // 대괄호 열기
    .replace(/\]/g, '\\]')   // 대괄호 닫기
    .replace(/\(/g, '\\(')   // 소괄호 열기
    .replace(/\)/g, '\\)')   // 소괄호 닫기
    .replace(/~/g, '\\~')    // 틸드
    .replace(/`/g, '\\`')    // 백틱
    .replace(/>/g, '\\>')    // 꺾쇠 괄호
    .replace(/#/g, '\\#')    // 해시
    .replace(/\+/g, '\\+')   // 플러스
    .replace(/-/g, '\\-')    // 하이픈
    .replace(/=/g, '\\=')    // 등호
    .replace(/\|/g, '\\|')   // 파이프
    .replace(/\{/g, '\\{')   // 중괄호 열기
    .replace(/\}/g, '\\}')   // 중괄호 닫기
    .replace(/\./g, '\\.')   // 점
    .replace(/!/g, '\\!')    // 느낌표
}

// 하위 호환성을 위해 escapeHtml 함수를 escapeMarkdownV2로 리다이렉트
export function escapeHtml(input: string): string {
  return escapeMarkdownV2(input)
}

/**
 * Split a string into chunks not exceeding maxLen, trying to break on whitespace.
 * If a single token exceeds maxLen, it will be hard-split.
 */
export function splitTelegramMessage(text: string, maxLen = 4096): string[] {
  if (text.length <= maxLen) return [text]

  const result: string[] = []
  let remaining = text
  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      result.push(remaining)
      break
    }

    // Prefer splitting at last whitespace within maxLen
    let cut = remaining.lastIndexOf(' ', maxLen)
    if (cut === -1 || cut < maxLen * 0.6) {
      // No good whitespace; hard split at maxLen
      cut = maxLen
    }

    result.push(remaining.slice(0, cut))
    remaining = remaining.slice(cut)
  }

  return result
}

/**
 * Create structured log entry
 */
export function createLogEntry(
  level: LogEntry['level'],
  message: string,
  metadata?: Partial<Omit<LogEntry, 'timestamp' | 'level' | 'message'>>
): LogEntry {
  return {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...metadata,
  }
}

/**
 * Log to console with structured format
 */
export function log(
  level: LogEntry['level'],
  message: string,
  metadata?: Partial<Omit<LogEntry, 'timestamp' | 'level' | 'message'>>
): void {
  const entry = createLogEntry(level, message, metadata)
  
  // In Workers environment, use console appropriately
  switch (level) {
    case 'error':
      console.error(JSON.stringify(entry))
      break
    case 'warn':
      console.warn(JSON.stringify(entry))
      break
    case 'debug':
      console.debug(JSON.stringify(entry))
      break
    default:
      console.log(JSON.stringify(entry))
  }
}

/**
 * Create an error with additional context
 */
export function createError(message: string, cause?: unknown, context?: Record<string, any>): Error {
  const error = new Error(message)
  if (cause) {
    error.cause = cause
  }
  if (context) {
    Object.assign(error, context)
  }
  return error
}

/**
 * Safe JSON parse with fallback
 */
export function safeJsonParse<T = any>(text: string, fallback: T): T {
  try {
    return JSON.parse(text)
  } catch {
    return fallback
  }
}

/**
 * Truncate text to max length
 */
export function truncate(text: string, maxLength: number, suffix = '...'): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength - suffix.length) + suffix
}

/**
 * Mask sensitive data for logging
 */
export function maskSensitive(data: any): any {
  if (typeof data !== 'object' || data === null) return data
  
  const masked = { ...data }
  const sensitiveKeys = ['token', 'key', 'secret', 'password', 'api_key', 'botToken']
  
  for (const key of Object.keys(masked)) {
    if (sensitiveKeys.some(sensitive => key.toLowerCase().includes(sensitive))) {
      masked[key] = '***masked***'
    }
  }
  
  return masked
}
