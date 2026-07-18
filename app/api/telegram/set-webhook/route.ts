import { NextRequest, NextResponse } from 'next/server'
import { setWebhook } from '@/lib/telegram'

export async function GET(req: NextRequest) {
  try {
    const secret = req.nextUrl.searchParams.get('secret')
    if (!secret || secret !== process.env.WEBHOOK_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL
    if (!appUrl) {
      return NextResponse.json(
        { error: 'NEXT_PUBLIC_APP_URL is not set' },
        { status: 500 }
      )
    }

    const webhookUrl = await setWebhook(appUrl)
    return NextResponse.json({ ok: true, url: webhookUrl })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to set webhook'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
