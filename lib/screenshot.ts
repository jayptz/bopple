import type { SupabaseClient } from '@supabase/supabase-js'

const NAV_TIMEOUT_MS = 45_000
const SETTLE_MS = 2_000
const SCREENSHOT_BUCKET = 'screenshots'

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
