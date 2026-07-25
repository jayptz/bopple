/**
 * E2B's getHost() returns a bare host (no scheme). Browsers treat bare hosts
 * in <a href> as relative paths (→ 404 on the app origin). Always https.
 */
export function absolutePreviewUrl(previewUrl: string): string {
  const trimmed = previewUrl.trim()
  if (!trimmed) return trimmed
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}
