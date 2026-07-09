import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { tasks } from '@trigger.dev/sdk/v3'
import { codingAgentJob } from '@/trigger/codingAgent'
import { sendMessage } from '@/lib/telegram'

interface TelegramMessage {
  message?: {
    text?: string
    chat: { id: number }
  }
}

export async function POST(req: NextRequest) {
  const supabase = createServiceClient()

  try {
    const secret = req.headers.get('x-telegram-bot-api-secret-token')
    if (secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await req.json()) as TelegramMessage
    const message = body.message
    if (!message?.text) return NextResponse.json({ ok: true })

    const chatId = message.chat.id.toString()
    const text = message.text.trim()

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('telegram_chat_id', chatId)
      .maybeSingle()

    if (userError) {
      await sendMessage(chatId, 'Something went wrong. Please try again.')
      return NextResponse.json({ ok: true })
    }

    if (!user) {
      await sendMessage(chatId, 'Connect your account at bopple.dev/connect')
      return NextResponse.json({ ok: true })
    }

    const { data: repo, error: repoError } = await supabase
      .from('repos')
      .select('id, full_name')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (repoError || !repo) {
      await sendMessage(chatId, 'Something went wrong. Please try again.')
      return NextResponse.json({ ok: true })
    }

    const { data: task, error: taskError } = await supabase
      .from('tasks')
      .insert({
        user_id: user.id,
        repo_id: repo.id,
        repo_full_name: repo.full_name,
        prompt: text,
        status: 'queued',
        source: 'telegram',
      })
      .select('id')
      .single()

    if (taskError || !task) {
      await sendMessage(chatId, 'Something went wrong. Please try again.')
      return NextResponse.json({ ok: true })
    }

    await tasks.trigger(codingAgentJob.id, { taskId: task.id })
    await sendMessage(
      chatId,
      "Got it. Working on it now, I'll ping you when the PR is ready."
    )

    return NextResponse.json({ ok: true })
  } catch {
    let chatId: string | null = null

    try {
      const body = (await req.json()) as TelegramMessage
      chatId = body.message?.chat?.id?.toString() ?? null
    } catch {
      // No-op: request body may already be consumed or invalid.
    }

    if (chatId) {
      await sendMessage(chatId, 'Something went wrong. Please try again.')
    }

    return NextResponse.json({ ok: true })
  }
}
