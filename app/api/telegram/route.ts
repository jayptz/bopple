import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { tasks } from '@trigger.dev/sdk/v3'
import { codingAgentJob } from '@/trigger/codingAgent'
import {
  sendMessage,
  sendWelcome,
  sendNoRepo,
  sendTaskLimitReached,
} from '@/lib/telegram'

interface TelegramMessage {
  message?: {
    text?: string
    chat: { id: number }
  }
}

async function handleConnect(supabase: ReturnType<typeof createServiceClient>, chatId: string, token: string) {
  const { data: profile, error } = await supabase
    .from('users')
    .select('id, github_username, telegram_chat_id')
    .eq('telegram_connect_token', token)
    .maybeSingle()

  if (error || !profile) {
    await sendMessage(chatId, 'Invalid connect token. Copy a fresh one from Settings in the dashboard.')
    return
  }

  if (profile.telegram_chat_id && profile.telegram_chat_id !== chatId) {
    await sendMessage(chatId, 'This account is already linked to another Telegram chat.')
    return
  }

  await supabase
    .from('users')
    .update({ telegram_chat_id: chatId })
    .eq('id', profile.id)

  await sendWelcome(chatId, profile.github_username)
}

async function handleFeedback(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  chatId: string,
  feedback: string
) {
  const { data: activeTask } = await supabase
    .from('tasks')
    .select('id')
    .eq('user_id', userId)
    .in('status', ['awaiting_feedback', 'running'])
    .order('completed_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!activeTask) {
    return false
  }

  await supabase.from('tasks').update({ status: 'queued' }).eq('id', activeTask.id)
  await tasks.trigger(codingAgentJob.id, { taskId: activeTask.id, feedback })
  await sendMessage(chatId, 'Got your feedback — continuing on it now.')
  return true
}

async function handleNewTask(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  chatId: string,
  text: string
) {
  const { data: profile } = await supabase
    .from('users')
    .select('tasks_used_this_month, tasks_limit, preferred_model')
    .eq('id', userId)
    .single()

  if (
    profile &&
    profile.tasks_used_this_month >= profile.tasks_limit
  ) {
    await sendTaskLimitReached(chatId)
    return
  }

  if (profile?.preferred_model.startsWith('gpt')) {
    await sendMessage(
      chatId,
      'VM agents currently require a Claude model. Switch to Claude in Settings → Model.'
    )
    return
  }

  const { data: repo, error: repoError } = await supabase
    .from('repos')
    .select('id, full_name')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (repoError || !repo) {
    await sendNoRepo(chatId)
    return
  }

  const { data: task, error: taskError } = await supabase
    .from('tasks')
    .insert({
      user_id: userId,
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
    return
  }

  await supabase
    .from('users')
    .update({ tasks_used_this_month: (profile?.tasks_used_this_month ?? 0) + 1 })
    .eq('id', userId)

  await tasks.trigger(codingAgentJob.id, { taskId: task.id })
  await sendMessage(
    chatId,
    "Got it — cloning your repo in a VM now. I'll ping you when the PR (and preview, if possible) is ready."
  )
}

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-telegram-bot-api-secret-token')
  if (secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: TelegramMessage
  try {
    body = (await req.json()) as TelegramMessage
  } catch {
    return NextResponse.json({ ok: true })
  }

  const message = body.message
  if (!message?.text) return NextResponse.json({ ok: true })

  const chatId = message.chat.id.toString()
  const text = message.text.trim()
  const supabase = createServiceClient()

  try {
    if (text.startsWith('/connect ')) {
      const token = text.slice('/connect '.length).trim()
      await handleConnect(supabase, chatId, token)
      return NextResponse.json({ ok: true })
    }

    if (text === '/start') {
      await sendMessage(
        chatId,
        '👋 *Bopple* — text a task, get a PR.\n\nLink your account from the dashboard Settings page, then send `/connect YOUR_TOKEN`.'
      )
      return NextResponse.json({ ok: true })
    }

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
      await sendMessage(
        chatId,
        'Connect your account first — open Settings in the Bopple dashboard and send `/connect YOUR_TOKEN` here.'
      )
      return NextResponse.json({ ok: true })
    }

    const handled = await handleFeedback(supabase, user.id, chatId, text)
    if (!handled) {
      await handleNewTask(supabase, user.id, chatId, text)
    }

    return NextResponse.json({ ok: true })
  } catch {
    await sendMessage(chatId, 'Something went wrong. Please try again.')
    return NextResponse.json({ ok: true })
  }
}
