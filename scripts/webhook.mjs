#!/usr/bin/env node
// Minimal Telegram webhook CLI using Node >=18 (global fetch)

const token = process.env.TELEGRAM_BOT_TOKEN
if (!token) {
  console.error('TELEGRAM_BOT_TOKEN is required')
  process.exit(1)
}

const cmd = process.argv[2]

async function main() {
  if (cmd === 'set') {
    const url = process.argv[3]
    const secret = process.env.WEBHOOK_SECRET_TOKEN || process.argv[4]
    if (!url) {
      console.error('Usage: webhook set <url> [secret] (or WEBHOOK_SECRET_TOKEN env)')
      process.exit(1)
    }
    const body = { url, allowed_updates: ['message'] }
    if (secret) {
      body.secret_token = secret
    }
    const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok || !json.ok) {
      console.error('setWebhook failed:', res.status, JSON.stringify(json))
      process.exit(1)
    }
    console.log('Webhook set:', url)
    return
  }

  if (cmd === 'delete') {
    const res = await fetch(`https://api.telegram.org/bot${token}/deleteWebhook`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ drop_pending_updates: true })
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok || !json.ok) {
      console.error('deleteWebhook failed:', res.status, JSON.stringify(json))
      process.exit(1)
    }
    console.log('Webhook deleted')
    return
  }

  if (cmd === 'info') {
    const res = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`)
    const json = await res.json().catch(() => ({}))
    if (!res.ok || !json.ok) {
      console.error('getWebhookInfo failed:', res.status, JSON.stringify(json))
      process.exit(1)
    }
    console.log(JSON.stringify(json.result, null, 2))
    return
  }

  console.log('Usage: webhook <set|delete|info> ...')
  console.log('Examples:')
  console.log('  TELEGRAM_BOT_TOKEN=... WEBHOOK_SECRET_TOKEN=... node scripts/webhook.mjs set https://<host>/telegram/webhook')
  console.log('  TELEGRAM_BOT_TOKEN=... node scripts/webhook.mjs delete')
  console.log('  TELEGRAM_BOT_TOKEN=... node scripts/webhook.mjs info')
}

main().catch((e) => { console.error(e); process.exit(1) })
