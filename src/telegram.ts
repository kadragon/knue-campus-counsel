import { fetchWithRetry } from './http'
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

export async function handleSmartStreaming(opts: {
  chatId: number
  botToken: string
  ragStream: AsyncGenerator<{ type: 'context' | 'content' | 'refs' | 'done'; data: any; }, void, unknown>
  fetchImpl?: FetchLike
}) {
  const { chatId, botToken, ragStream, fetchImpl = fetch } = opts
  
  let messageContent = ''
  let messageId: number | null = null
  let lastUpdate = 0
  let refs: { title?: string; url?: string }[] = []
  
  const UPDATE_INTERVAL = 2000 // 2초마다 업데이트
  const MIN_CONTENT_LENGTH = 50 // 최소 50자부터 메시지 전송
  
  // 초기 "처리 중" 메시지 전송
  try {
    const initialMsg = await sendMessage({
      chatId,
      text: '🤖 질문을 분석하고 있습니다...',
      botToken,
      fetchImpl
    })
    messageId = initialMsg.message_id
  } catch (error) {
    console.error('Failed to send initial message:', error)
    throw error
  }

  try {
    for await (const chunk of ragStream) {
      const now = Date.now()
      
      switch (chunk.type) {
        case 'context':
          // 검색 결과 발견 시 상태 업데이트
          try {
            await editMessageText({
              chatId,
              messageId: messageId!,
              text: `🔍 ${chunk.data.resultsCount}개의 관련 문서를 찾았습니다. 답변을 생성 중...`,
              botToken,
              fetchImpl
            })
          } catch (error) {
            // 에러 무시 (rate limit 등)
          }
          break
          
        case 'content':
          messageContent += chunk.data
          
          // 충분한 내용이 쌓이고 일정 시간이 지났을 때만 업데이트
          if (messageContent.length >= MIN_CONTENT_LENGTH && 
              now - lastUpdate > UPDATE_INTERVAL) {
            try {
              await editMessageText({
                chatId,
                messageId: messageId!,
                text: messageContent + ' ⏳',
                botToken,
                fetchImpl
              })
              lastUpdate = now
            } catch (error) {
              // Rate limit 에러 등 무시
            }
          }
          break
          
        case 'refs':
          refs = chunk.data
          break
          
        case 'done':
          // 최종 메시지 완성
          let finalMessage = messageContent
          
          if (refs.length > 0) {
            finalMessage += '\n\n📚 <b>참고 문서:</b>\n'
            refs.forEach((ref, i) => {
              if (ref.title && ref.url) {
                finalMessage += `${i + 1}. <a href="${ref.url}">${ref.title}</a>\n`
              }
            })
          }
          
          // 최종 메시지 업데이트
          try {
            await editMessageText({
              chatId,
              messageId: messageId!,
              text: finalMessage,
              botToken,
              fetchImpl
            })
          } catch (error) {
            console.error('Failed to send final message:', error)
          }
          break
      }
    }
  } catch (error) {
    // 스트리밍 중 에러 발생 시 에러 메시지 전송
    try {
      await editMessageText({
        chatId,
        messageId: messageId!,
        text: '❌ 답변 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
        botToken,
        fetchImpl
      })
    } catch (editError) {
      console.error('Failed to send error message:', editError)
    }
    throw error
  }
}
