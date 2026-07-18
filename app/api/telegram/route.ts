import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { tasks } from '@trigger.dev/sdk/v3'
import { codingAgentJob } from '@/trigger/codingAgent'
import { sendMessage, sendTaskQueued } from '@/lib/telegram'

interface TelegramUpdate {
  message?: {
    text?: string
    chat: { id: number }
  }
}

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-telegram-bot-api-secret-token')
  if (secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let chatId: string | null = null

  try {
    const body = (await req.json()) as TelegramUpdate
    const message = body.message
    if (!message?.text) {
      return NextResponse.json({ ok: true })
    }

    chatId = message.chat.id.toString()
    const text = message.text.trim()
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://bopple.dev'

    if (text === '/start') {
      await sendMessage(
        chatId,
        `👋 Welcome to Bopple! Connect your GitHub at ${appUrl}/connect?chat_id=${chatId}`
      )
      return NextResponse.json({ ok: true })
    }

    if (text === '/help') {
      await sendMessage(
        chatId,
        "Send me a coding task in plain English and I'll write the code, open a PR, and ping you when it's done."
      )
      return NextResponse.json({ ok: true })
    }

    const supabase = createServiceClient()
    const { data: task, error: taskError } = await supabase
      .from('tasks')
      .insert({
        prompt: text,
        source: 'telegram',
        status: 'queued',
        telegram_chat_id: chatId,
      })
      .select('id')
      .single()

    if (taskError || !task) {
      await sendMessage(
        chatId,
        `❌ Something went wrong: ${taskError?.message ?? 'Failed to create task'}`
      )
      return NextResponse.json({ ok: true })
    }

    await sendTaskQueued(chatId, text)
    await tasks.trigger(codingAgentJob.id, { taskId: task.id })

    return NextResponse.json({ ok: true })
  } catch (error) {
    if (chatId) {
      try {
        const message =
          error instanceof Error ? error.message : 'Something went wrong'
        await sendMessage(chatId, `❌ Something went wrong: ${message}`)
      } catch {
        // Ignore secondary Telegram failures — still return 200.
      }
    }

    return NextResponse.json({ ok: true })
  }
}
