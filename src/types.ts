export interface TelegramUpdate {
  update_id: number
  message?: TelegramMessage
  callback_query?: TelegramCallbackQuery
}

export interface TelegramMessage {
  message_id: number
  from?: TelegramUser
  chat: TelegramChat
  date: number
  text?: string
  entities?: TelegramMessageEntity[]
}

export interface TelegramUser {
  id: number
  is_bot: boolean
  first_name: string
  last_name?: string
  username?: string
  language_code?: string
}

export interface TelegramChat {
  id: number
  type: 'private' | 'group' | 'supergroup' | 'channel'
  title?: string
  username?: string
  first_name?: string
  last_name?: string
}

export interface TelegramMessageEntity {
  type: string
  offset: number
  length: number
  url?: string
  user?: TelegramUser
}

export interface TelegramCallbackQuery {
  id: string
  from: TelegramUser
  message?: TelegramMessage
  data?: string
}

export interface RagResult {
  answer: string
  refs: DocumentReference[]
}

export interface DocumentReference {
  title?: string
  url?: string
  article_no?: string
  effective_date?: string
}

export interface SearchResult {
  id: string | number
  score: number
  payload?: DocumentPayload
}

export interface DocumentPayload {
  doc_id?: string
  title?: string
  article_no?: string
  effective_date?: string
  url?: string
  chunk_text?: string
  is_active?: boolean
}

export interface LogEntry {
  timestamp: string
  level: 'info' | 'debug' | 'error' | 'warn'
  message: string
  user_id?: number
  query?: string
  latency?: number
  error?: string
  refs?: string[]
}