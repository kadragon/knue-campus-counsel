type FetchLike = typeof fetch

export type RetryOptions = {
  retries?: number
  timeoutMs?: number
  backoffBaseMs?: number
  fetchImpl?: FetchLike
  sleepImpl?: (ms: number) => Promise<void>
  retryOn?: (status: number) => boolean
}

const defaultRetryOn = (s: number) => s === 429 || (s >= 500 && s < 600)
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

export async function fetchWithRetry(input: RequestInfo | URL, init: RequestInit = {}, opts: RetryOptions = {}) {
  const {
    retries = 2,
    timeoutMs = 12_000,
    backoffBaseMs = 250,
    fetchImpl = fetch,
    sleepImpl = sleep,
    retryOn = defaultRetryOn,
  } = opts

  let attempt = 0
  let lastErr: any
  while (attempt <= retries) {
    try {
      const controller = new AbortController()
      let timer: any
      const fetchPromise = fetchImpl(input, { ...init, signal: controller.signal })
      const timeoutPromise = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort(new Error('timeout'))
          reject(new Error('timeout'))
        }, timeoutMs)
      })
      const res = await Promise.race([fetchPromise, timeoutPromise]) as Response
      clearTimeout(timer)
      if (!res.ok && retryOn(res.status) && attempt < retries) {
        const delay = backoffBaseMs * Math.pow(2, attempt)
        await sleepImpl(delay)
        attempt++
        continue
      }
      return res
    } catch (e) {
      lastErr = e
      if (attempt >= retries) break
      await sleepImpl(backoffBaseMs * Math.pow(2, attempt))
      attempt++
    }
  }
  throw (lastErr instanceof Error ? lastErr : new Error(String(lastErr)))
}
