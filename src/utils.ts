export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
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
