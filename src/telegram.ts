import { fetchWithRetry } from './http'
type FetchLike = typeof fetch

export async function sendMessage(opts: {
  chatId: number
  text: string
  botToken: string
  disablePreview?: boolean
  fetchImpl?: FetchLike
}) {
  const {
    chatId,
    text,
    botToken,
    disablePreview = true,
    fetchImpl = fetch,
  } = opts
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`
  const res = await fetchWithRetry(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: disablePreview,
    }),
  }, { fetchImpl })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Telegram sendMessage failed: ${res.status} ${text}`)
  }
  return res
}

export async function setWebhook(opts: {
  botToken: string
  url: string
  secretToken: string
  allowedUpdates?: string[]
  dropPending?: boolean
  fetchImpl?: FetchLike
}) {
  const { botToken, url, secretToken, allowedUpdates, dropPending = false, fetchImpl = fetch } = opts
  const api = `https://api.telegram.org/bot${botToken}/setWebhook`
  const res = await fetchWithRetry(api, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url, secret_token: secretToken, allowed_updates: allowedUpdates, drop_pending_updates: dropPending }),
  }, { fetchImpl })
  if (!res.ok) throw new Error(`Telegram setWebhook failed: ${res.status}`)
  return res
}

export async function deleteWebhook(opts: { botToken: string; dropPending?: boolean; fetchImpl?: FetchLike }) {
  const { botToken, dropPending = false, fetchImpl = fetch } = opts
  const api = `https://api.telegram.org/bot${botToken}/deleteWebhook`
  const res = await fetchWithRetry(api, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ drop_pending_updates: dropPending }),
  }, { fetchImpl })
  if (!res.ok) throw new Error(`Telegram deleteWebhook failed: ${res.status}`)
  return res
}

export async function getWebhookInfo(opts: { botToken: string; fetchImpl?: FetchLike }) {
  const { botToken, fetchImpl = fetch } = opts
  const api = `https://api.telegram.org/bot${botToken}/getWebhookInfo`
  const res = await fetchWithRetry(api, { method: 'GET' }, { fetchImpl })
  if (!res.ok) throw new Error(`Telegram getWebhookInfo failed: ${res.status}`)
  const json = await res.json() as any
  return json.result
}
