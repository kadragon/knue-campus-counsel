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
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: disablePreview,
    }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Telegram sendMessage failed: ${res.status} ${text}`)
  }
  return res
}

