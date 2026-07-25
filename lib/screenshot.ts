import type { SupabaseClient } from '@supabase/supabase-js'

const NAV_TIMEOUT_MS = 45_000
const SETTLE_MS = 2_000
const SCREENSHOT_BUCKET = 'screenshots'

/**
 * Public E2B host can lag behind localhost-ready inside the sandbox.
 * 60s covers typical tunnel + first compile without blocking the job forever;
 * on timeout we skip the screenshot rather than send a broken 404 frame.
 */
export const PREVIEW_READY_TIMEOUT_MS = 60_000
const PREVIEW_READY_POLL_MS = 2_000

function toAbsoluteUrl(previewUrl: string, route: string): string {
  // E2B's getHost() returns a bare host (no scheme) — normalize to https.
  const base = previewUrl.startsWith('http') ? previewUrl : `https://${previewUrl}`
  const path = route.startsWith('/') ? route : `/${route}`
  return `${base.replace(/\/$/, '')}${path}`
}

export interface CaptureResult {
  buffer: Buffer | null
  error: string | null
  url: string
}

export interface PreviewReadyResult {
  ready: boolean
  waitedMs: number
  lastStatus: number | null
  url: string
}

function isPreviewEdgeNotReady(status: number | null): boolean {
  // Connection failures → null. 502/503/504 = tunnel/proxy not ready yet.
  // Plain 404 from a live Next app means the host is up (wrong route ≠ not ready).
  if (status == null) return true
  return status === 502 || status === 503 || status === 504
}

/**
 * Poll the *public* preview URL until the edge responds.
 * `waitForLocalPort` only proves the process is up inside the sandbox —
 * E2B's getHost() tunnel often needs a few more seconds before outsiders
 * stop seeing connection errors / gateway 404s.
 */
export async function waitForPreviewReady(
  previewUrl: string,
  route: string,
  options?: { timeoutMs?: number; pollMs?: number }
): Promise<PreviewReadyResult> {
  const timeoutMs = options?.timeoutMs ?? PREVIEW_READY_TIMEOUT_MS
  const pollMs = options?.pollMs ?? PREVIEW_READY_POLL_MS
  const url = toAbsoluteUrl(previewUrl, route)
  const started = Date.now()
  let lastStatus: number | null = null

  while (Date.now() - started < timeoutMs) {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 8_000)
      try {
        const res = await fetch(url, {
          method: 'GET',
          redirect: 'follow',
          signal: controller.signal,
          headers: { Accept: 'text/html,application/xhtml+xml,*/*' },
        })
        lastStatus = res.status
        if (!isPreviewEdgeNotReady(res.status)) {
          const waitedMs = Date.now() - started
          return { ready: true, waitedMs, lastStatus, url }
        }
      } finally {
        clearTimeout(timer)
      }
    } catch {
      lastStatus = null
    }

    const remaining = timeoutMs - (Date.now() - started)
    if (remaining <= 0) break
    await new Promise((resolve) => setTimeout(resolve, Math.min(pollMs, remaining)))
  }

  return {
    ready: false,
    waitedMs: Date.now() - started,
    lastStatus,
    url,
  }
}

/**
 * Screenshot the running preview app.
 * Playwright is imported lazily so Next.js doesn't bundle it.
 */
export async function captureScreenshot(
  previewUrl: string,
  route: string
): Promise<CaptureResult> {
  const url = toAbsoluteUrl(previewUrl, route)

  try {
    const { chromium } = await import('playwright')
    const browser = await chromium.launch({
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    })
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
      // networkidle often never settles on real sites (analytics/websockets).
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS })
      await page.waitForTimeout(SETTLE_MS)
      const buffer = await page.screenshot({ type: 'png', fullPage: false })
      return { buffer, error: null, url }
    } finally {
      await browser.close().catch(() => undefined)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Screenshot capture failed'
    return { buffer: null, error: message.slice(0, 300), url }
  }
}

/**
 * Upload a PNG to the public `screenshots` storage bucket and return its public URL.
 */
export async function uploadScreenshot(
  supabase: SupabaseClient,
  taskId: string,
  buffer: Buffer
): Promise<{ url: string | null; error: string | null }> {
  const path = `${taskId}/${Date.now()}.png`
  const { error } = await supabase.storage
    .from(SCREENSHOT_BUCKET)
    .upload(path, buffer, { contentType: 'image/png', upsert: true })

  if (error) {
    return { url: null, error: error.message }
  }

  const { data } = supabase.storage.from(SCREENSHOT_BUCKET).getPublicUrl(path)
  return { url: data.publicUrl ?? null, error: data.publicUrl ? null : 'No public URL returned' }
}
