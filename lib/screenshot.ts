import type { Browser } from 'playwright'
import type { SupabaseClient } from '@supabase/supabase-js'

const NAV_TIMEOUT_MS = 20_000
const SETTLE_MS = 1_000
const SCREENSHOT_BUCKET = 'screenshots'

function toAbsoluteUrl(previewUrl: string, route: string): string {
  // E2B's getHost() returns a bare host (no scheme) — normalize to https.
  const base = previewUrl.startsWith('http') ? previewUrl : `https://${previewUrl}`
  const path = route.startsWith('/') ? route : `/${route}`
  return `${base.replace(/\/$/, '')}${path}`
}

/**
 * Screenshot the running preview app. Returns a PNG buffer, or null if the page
 * couldn't be captured (server not ready, bad route, navigation timeout).
 * Playwright is imported lazily so it never enters the Next.js server bundle.
 */
export async function captureScreenshot(
  previewUrl: string,
  route: string
): Promise<Buffer | null> {
  const url = toAbsoluteUrl(previewUrl, route)
  const { chromium } = await import('playwright')

  let browser: Browser | null = null
  try {
    browser = await chromium.launch({ args: ['--no-sandbox'] })
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
    await page.goto(url, { waitUntil: 'networkidle', timeout: NAV_TIMEOUT_MS })
    await page.waitForTimeout(SETTLE_MS)
    return await page.screenshot({ type: 'png', fullPage: false })
  } catch {
    return null
  } finally {
    if (browser) await browser.close().catch(() => undefined)
  }
}

/**
 * Upload a PNG to the public `screenshots` storage bucket and return its public
 * URL, or null on failure. Uses the service-role client (bypasses RLS).
 */
export async function uploadScreenshot(
  supabase: SupabaseClient,
  taskId: string,
  buffer: Buffer
): Promise<string | null> {
  const path = `${taskId}/${Date.now()}.png`
  const { error } = await supabase.storage
    .from(SCREENSHOT_BUCKET)
    .upload(path, buffer, { contentType: 'image/png', upsert: true })
  if (error) return null

  const { data } = supabase.storage.from(SCREENSHOT_BUCKET).getPublicUrl(path)
  return data.publicUrl ?? null
}
