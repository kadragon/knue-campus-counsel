import { fetchWithRetry } from '../utils/http.js'
type FetchLike = typeof fetch


export async function sendMessage(opts: {
  chatId: number
  text: string
  botToken: string
  disablePreview?: boolean
  fetchImpl?: FetchLike
}): Promise<any> {
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
  const json = await res.json().catch(() => ({}))
  return json?.result ?? json
}

export async function sendChatAction(opts: {
  chatId: number
  action: 'typing' | 'upload_photo' | 'record_video' | 'upload_video' | 'record_voice' | 'upload_voice' | 'upload_document' | 'choose_sticker' | 'find_location' | 'record_video_note' | 'upload_video_note'
  botToken: string
  fetchImpl?: FetchLike
}) {
  const { chatId, action, botToken, fetchImpl = fetch } = opts
  const url = `https://api.telegram.org/bot${botToken}/sendChatAction`
  const res = await fetchWithRetry(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, action }),
  }, { fetchImpl })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Telegram sendChatAction failed: ${res.status} ${text}`)
  }
  return res
}

export async function editMessageText(opts: {
  chatId: number
  messageId: number
  text: string
  botToken: string
  disablePreview?: boolean
  fetchImpl?: FetchLike
}) {
  const { chatId, messageId, text, botToken, disablePreview = true, fetchImpl = fetch } = opts
  const url = `https://api.telegram.org/bot${botToken}/editMessageText`
  const res = await fetchWithRetry(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: disablePreview,
    }),
  }, { fetchImpl })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Telegram editMessageText failed: ${res.status} ${text}`)
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

export async function handleProgressiveStatus(opts: {
  chatId: number
  botToken: string
  ragFunction: () => Promise<{ answer: string; refs: { title?: string; url?: string }[] }>
  fetchImpl?: FetchLike
}) {
  const { chatId, botToken, ragFunction, fetchImpl = fetch } = opts
  
  let messageId: number | null = null
  
  try {
    // 1단계: 초기 분석 메시지
    const initialMsg = await sendMessage({
      chatId,
      text: '🤖 질문을 분석하고 있습니다...',
      botToken,
      fetchImpl
    })
    messageId = initialMsg.message_id

    // 2단계: 문서 검색 상태 표시
    try {
      await editMessageText({
        chatId,
        messageId: messageId!,
        text: '🔍 관련 문서를 검색하고 있습니다...',
        botToken,
        fetchImpl
      })
    } catch (error) {
      // 에러 무시 (rate limit 등)
    }

    // 실제 RAG 처리 실행
    const result = await ragFunction()

    // 3단계: 답변 생성 상태 표시
    try {
      await editMessageText({
        chatId,
        messageId: messageId!,
        text: '💭 답변을 생성하고 있습니다...',
        botToken,
        fetchImpl
      })
    } catch (error) {
      // 에러 무시
    }

    // 4단계: 최종 답변 표시
    let finalMessage = result.answer
    
    if (result.refs.length > 0) {
      finalMessage += '\n\n📚 <b>참고 문서:</b>\n'
      let validRefIndex = 1
      result.refs.forEach((ref) => {
        if (ref.title && ref.url) {
          // Escape HTML entities in title and validate URL
          const escapedTitle = ref.title
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;")
          
          // Enhanced URL validation using URL constructor
          try {
            const url = new URL(ref.url.trim())
            if (url.protocol === 'http:' || url.protocol === 'https:') {
              finalMessage += `${validRefIndex}. <a href="${url.href}">${escapedTitle}</a>\n`
              validRefIndex++
            }
          } catch {
            // Invalid URL, skip this reference
          }
        }
      })
    }
    
    // 최종 메시지 업데이트
    await editMessageText({
      chatId,
      messageId: messageId!,
      text: finalMessage,
      botToken,
      fetchImpl
    })

  } catch (error) {
    // 에러 발생 시 에러 메시지 전송
    try {
      if (messageId) {
        await editMessageText({
          chatId,
          messageId: messageId!,
          text: '❌ 답변 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
          botToken,
          fetchImpl
        })
      } else {
        await sendMessage({
          chatId,
          text: '❌ 답변 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
          botToken,
          fetchImpl
        })
      }
    } catch (editError) {
      console.error('Failed to send error message:', editError)
    }
    throw error
  }
}
