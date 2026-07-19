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
    const supabase = createServiceClient()

    if (text === '/start') {
      await sendMessage(
        chatId,
        `👋 Welcome to Bopple!\n\nConnect your account: open Settings in the dashboard and send the \`/connect\` command shown there.`
      )
      return NextResponse.json({ ok: true })
    }

    if (text === '/help') {
      await sendMessage(
        chatId,
        "Send me a coding task in plain English and I'll write the code, open a PR, and ping you when it's done.\n\nFirst time? Copy `/connect <token>` from Bopple Settings and send it here."
      )
      return NextResponse.json({ ok: true })
    }

    // Link Telegram chat to a Bopple account via Settings connect token.
    // Must run before telegram_chat_id lookup — first-time users aren't linked yet.
    if (text.toLowerCase().startsWith('/connect ')) {
      const token = text.slice('/connect '.length).trim()

      if (!token) {
        await sendMessage(
          chatId,
          '❌ Invalid or expired connect token. Get a new one from Settings.'
        )
        return NextResponse.json({ ok: true })
      }

      const { data: connectUser } = await supabase
        .from('users')
        .select('id')
        .eq('telegram_connect_token', token)
        .maybeSingle()

      if (!connectUser) {
        await sendMessage(
          chatId,
          '❌ Invalid or expired connect token. Get a new one from Settings.'
        )
        return NextResponse.json({ ok: true })
      }

      const { error: connectError } = await supabase
        .from('users')
        .update({ telegram_chat_id: chatId })
        .eq('id', connectUser.id)

      if (connectError) {
        await sendMessage(
          chatId,
          `❌ Something went wrong: ${connectError.message}`
        )
        return NextResponse.json({ ok: true })
      }

      await sendMessage(
        chatId,
        '✅ Connected! You can now send me coding tasks.'
      )
      return NextResponse.json({ ok: true })
    }

    const { data: user } = await supabase
      .from('users')
      .select('id, tasks_used_this_month, tasks_limit')
      .eq('telegram_chat_id', chatId)
      .maybeSingle()

    if (!user) {
      await sendMessage(
        chatId,
        `Connect your account first: open ${appUrl}/dashboard/settings and send the \`/connect\` command shown there.`
      )
      return NextResponse.json({ ok: true })
    }

    const { data: repo } = await supabase
      .from('repos')
      .select('id, full_name')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (!repo) {
      await sendMessage(
        chatId,
        '⚠️ No active repo. Connect one in the Bopple dashboard first.'
      )
      return NextResponse.json({ ok: true })
    }

    const { data: task, error: taskError } = await supabase
      .from('tasks')
      .insert({
        user_id: user.id,
        repo_id: repo.id,
        repo_full_name: repo.full_name,
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

    await supabase
      .from('users')
      .update({ tasks_used_this_month: user.tasks_used_this_month + 1 })
      .eq('id', user.id)

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
