export function sanitizeFilenameBase(value: string, fallback: string): string {
  const safe = String(value || '')
    .replace(/[^a-z0-9-_]/gi, '_')
    .toLowerCase()
  return safe || fallback
}

export function downloadJsonFile(payload: unknown, filenameBase: string, fallbackBase: string): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${sanitizeFilenameBase(filenameBase, fallbackBase)}.json`
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

export function safeJsonParse<T>(content: string): T | null {
  try {
    return JSON.parse(content) as T
  } catch {
    return null
  }
}
