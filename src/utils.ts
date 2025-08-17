import type { LogEntry } from './types'

export function escapeMarkdownV2(input: string): string {
  // 일반 Markdown의 **bold**를 Telegram MarkdownV2의 *bold*로 정규화
  const normalized = input.replace(/\*\*([^*]+)\*\*/g, '*$1*')

  // MarkdownV2에서 이스케이프가 필요한 특수 문자들
  // 굵게/기울임 등에 쓰이는 '*'와 '_'는 포맷팅 보존을 위해 이스케이프하지 않음
  return normalized
    .replace(/\\/g, '\\\\')  // 백슬래시
    // .replace(/_/g, '\\_')    // 언더스코어 (포맷팅 보존)
    // .replace(/\*/g, '\\*')   // 별표 (포맷팅 보존)
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

/**
 * Escape for MarkdownV2 inside code or pre code entities: only ` and \ must be escaped.
 */
function escapeForCode(content: string): string {
  return content.replace(/\\/g, '\\\\').replace(/`/g, '\\`')
}

/**
 * Escape for MarkdownV2 inside link URL: only ) and \ must be escaped.
 */
function escapeForLinkUrl(url: string): string {
  return url.replace(/\\/g, '\\\\').replace(/\)/g, '\\)')
}

/**
 * Escape for MarkdownV2 inside link text: escape all specials including * and _ to avoid nested formatting issues.
 */
function escapeForLinkText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/_/g, '\\_')
    .replace(/\*/g, '\\*')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/~/g, '\\~')
    .replace(/`/g, '\\`')
    .replace(/>/g, '\\>')
    .replace(/#/g, '\\#')
    .replace(/\+/g, '\\+')
    .replace(/-/g, '\\-')
    .replace(/=/g, '\\=')
    .replace(/\|/g, '\\|')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/\./g, '\\.')
    .replace(/!/g, '\\!')
}

/**
 * Convert common Markdown to Telegram MarkdownV2 safely.
 * - Normalizes **bold** to *bold*
 * - Preserves inline links: [text](url) with correct escaping rules
 * - Preserves inline code and fenced code blocks with correct escaping rules
 * - Escapes remaining text with MarkdownV2 rules while keeping * and _ usable
 */
export function renderMarkdownToTelegramV2(input: string): string {
  let text = input

  // Normalize **bold** to *bold*
  text = text.replace(/\*\*([^*]+)\*\*/g, '*$1*')

  type Slot = { type: 'block_code' | 'inline_code' | 'link'; value: string }
  const slots: Slot[] = []
  const START = "\uE000"
  const END = "\uE001"
  const makeToken = (i: number) => `${START}${i}${END}`

  // 1) Fenced code blocks ```lang?\n...```
  text = text.replace(/```([a-zA-Z0-9_-]+)?\n([\s\S]*?)```/g, (_, lang: string | undefined, body: string) => {
    const escaped = escapeForCode(body)
    const code = '```' + (lang ?? '') + '\n' + escaped + '```'
    const idx = slots.push({ type: 'block_code', value: code }) - 1
    return makeToken(idx)
  })

  // 2) Inline code `...`
  text = text.replace(/`([^`\\]|\\.)*`/g, (m) => {
    const inner = m.slice(1, -1)
    const escaped = escapeForCode(inner)
    const code = '`' + escaped + '`'
    const idx = slots.push({ type: 'inline_code', value: code }) - 1
    return makeToken(idx)
  })

  // 3) Links [text](url)
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, rawText: string, rawUrl: string) => {
    const t = escapeForLinkText(rawText)
    const u = escapeForLinkUrl(rawUrl)
    const link = `[${t}](${u})`
    const idx = slots.push({ type: 'link', value: link }) - 1
    return makeToken(idx)
  })

  // 4) Escape remaining text as MarkdownV2 (preserving * and _)
  text = escapeMarkdownV2(text)

  // 5) Restore slots
  const restoreRe = new RegExp(`${START}(\\d+)${END}`, 'g')
  text = text.replace(restoreRe as any, (_: string, i: string) => {
    const slot = slots[Number(i)]
    return slot?.value ?? ''
  })

  return text
}

/**
 * Escape HTML special characters for Telegram HTML parsing mode
 */
export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * Convert mixed Markdown/HTML to clean HTML for Telegram
 */
export function renderMarkdownToTelegramHTML(input: string): string {
  let text = input
  
  // Remove MarkdownV2 escape sequences that LLM might still generate
  text = text
    .replace(/\\([_.[\]()~`>#+=|{}.!:-])/g, '$1')
  
  // Simple approach: preserve existing HTML tags and convert markdown
  const htmlTagRegex = /<\/?[a-zA-Z][^>]*>/g
  const tags: string[] = []
  const PLACEHOLDER = '\uE000TAG\uE001'
  
  // Extract existing HTML tags
  text = text.replace(htmlTagRegex, (match) => {
    tags.push(match)
    return `${PLACEHOLDER}${tags.length - 1}${PLACEHOLDER}`
  })
  
  // Now escape HTML special characters in the remaining text
  text = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  
  // Convert markdown syntax
  text = text
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')  // **bold**
    .replace(/\*([^*]+)\*/g, '<i>$1</i>')      // *italic*
    .replace(/`([^`]+)`/g, '<code>$1</code>')  // `code`
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')  // [text](url)
  
  // Restore HTML tags
  text = text.replace(new RegExp(`${PLACEHOLDER}(\\d+)${PLACEHOLDER}`, 'g'), (_, index) => {
    return tags[parseInt(index)] || ''
  })
  
  return text
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
