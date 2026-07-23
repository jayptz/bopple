import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { tasks } from '@trigger.dev/sdk/v3'
import { codingAgentJob } from '@/trigger/codingAgent'
import {
  downloadTelegramFile,
  sendMessage,
  sendTaskQueued,
  sendTypingAction,
} from '@/lib/telegram'
import {
  ACTIVE_TASK_STATUSES,
  decideTelegramRoute,
  formatRouteLog,
  resolveRepoFromMessage,
  type ConnectedRepo,
} from '@/lib/telegram-routing'
import type { FeedbackEntry } from '@/types'

interface TelegramUpdate {
  message?: {
    message_id?: number
    text?: string
    caption?: string
    photo?: {
      file_id: string
      file_unique_id: string
      width: number
      height: number
    }[]
    chat: { id: number }
    reply_to_message?: {
      message_id: number
      text?: string
      from?: { is_bot?: boolean }
    }
  }
}

/** Reject Telegram photos whose base64 payload exceeds ~5MB. */
const MAX_REFERENCE_IMAGE_BASE64_CHARS = 5 * 1024 * 1024
const DEFAULT_PHOTO_PROMPT = 'Make the UI match this reference image'

type ContinuableTask = {
  id: string
  status: string
  feedback_history: FeedbackEntry[] | null
  branch_name: string | null
  prompt: string
  telegram_message_ids: number[] | null
  repo_full_name: string | null
}

const TASK_SELECT =
  'id, status, feedback_history, branch_name, prompt, telegram_message_ids, repo_full_name'

async function appendTelegramMessageIds(
  supabase: ReturnType<typeof createServiceClient>,
  taskId: string,
  ids: Array<number | null | undefined>
) {
  const nextIds = ids.filter((id): id is number => typeof id === 'number')
  if (nextIds.length === 0) return

  await supabase.rpc('append_telegram_message_ids', {
    p_task_id: taskId,
    p_ids: nextIds,
  })
}

/** Most recent active task for a specific repo (not global). */
async function findActiveTaskForRepo(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  repoFullName: string
): Promise<ContinuableTask | null> {
  const { data } = await supabase
    .from('tasks')
    .select(TASK_SELECT)
    .eq('user_id', userId)
    .eq('repo_full_name', repoFullName)
    .in('status', [...ACTIVE_TASK_STATUSES])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return (data as ContinuableTask | null) ?? null
}

/**
 * When no repo is named: continue via explicit reply, or the latest
 * awaiting_feedback task (prior behavior).
 */
async function findTaskForReply(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  replyToMessageId: number | undefined
): Promise<ContinuableTask | null> {
  // 1) Exact match: user replied to a message we linked to a task
  if (replyToMessageId != null) {
    const { data: byReply } = await supabase
      .from('tasks')
      .select(TASK_SELECT)
      .eq('user_id', userId)
      .contains('telegram_message_ids', [replyToMessageId])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (byReply) return byReply as ContinuableTask
  }

  // 2) Any task waiting for input — plain replies continue it too.
  const { data: awaiting } = await supabase
    .from('tasks')
    .select(TASK_SELECT)
    .eq('user_id', userId)
    .eq('status', 'awaiting_feedback')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (awaiting) return awaiting as ContinuableTask

  // 3) Explicit Telegram reply but no ID match yet — continue most recent unfinished.
  if (replyToMessageId != null) {
    const { data: recent } = await supabase
      .from('tasks')
      .select(TASK_SELECT)
      .eq('user_id', userId)
      .in('status', ['awaiting_feedback', 'failed', 'done'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (recent) return recent as ContinuableTask
  }

  return null
}

async function continueTaskWithFeedback(
  supabase: ReturnType<typeof createServiceClient>,
  chatId: string,
  task: ContinuableTask,
  text: string,
  userMessageId?: number
) {
  const entry: FeedbackEntry = {
    timestamp: new Date().toISOString(),
    message: text,
  }
  const history = [...(task.feedback_history ?? []), entry]

  const { error: feedbackError } = await supabase
    .from('tasks')
    .update({
      status: 'queued',
      feedback_history: history,
      error_message: null,
    })
    .eq('id', task.id)

  if (feedbackError) {
    await sendMessage(chatId, `Something went wrong: ${feedbackError.message}`)
    return
  }

  if (userMessageId != null) {
    await appendTelegramMessageIds(supabase, task.id, [userMessageId])
  }

  await sendTypingAction(chatId).catch(() => undefined)
  const queuedId = await sendTaskQueued(chatId, text, { isFollowUp: true })
  await appendTelegramMessageIds(supabase, task.id, [queuedId])

  await tasks.trigger(codingAgentJob.id, {
    taskId: task.id,
    feedback: text,
  })
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
    const hasPhoto = Boolean(message?.photo && message.photo.length > 0)
    const rawText = (message?.text ?? message?.caption ?? '').trim()

    if (!message || (!rawText && !hasPhoto)) {
      return NextResponse.json({ ok: true })
    }

    chatId = message.chat.id.toString()
    const text = rawText
    const userMessageId = message.message_id
    const replyToMessageId = message.reply_to_message?.message_id
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://bopple.dev'
    const supabase = createServiceClient()

    await sendTypingAction(chatId).catch(() => undefined)

    if (text === '/start') {
      await sendMessage(
        chatId,
        `Welcome to Bopple!\n\nConnect your account: open Settings in the dashboard and send the \`/connect\` command shown there.`
      )
      return NextResponse.json({ ok: true })
    }

    if (text === '/help') {
      await sendMessage(
        chatId,
        "Send me a coding task in plain English and I'll write the code, open a PR, and ping you when it's done.\n\nYou can also send a *screenshot* with a caption — I'll use it as a visual reference.\n\nMention a connected repo by name — e.g. _on bopple fix the timeout_ or _add a project to hotspots_. No repo name? I'll use your default.\n\nTo tweak a PR, *reply* to my message (or just send feedback while a task needs input) — I'll keep going on the same branch.\n\nSay /new before a message if you want to start a brand new task instead.\n\nFirst time? Copy `/connect <token>` from Bopple Settings and send it here."
      )
      return NextResponse.json({ ok: true })
    }

    if (text.toLowerCase().startsWith('/connect ')) {
      const token = text.slice('/connect '.length).trim()

      if (!token) {
        await sendMessage(
          chatId,
          'Invalid or expired connect token. Get a new one from Settings.'
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
          'Invalid or expired connect token. Get a new one from Settings.'
        )
        return NextResponse.json({ ok: true })
      }

      const { error: connectError } = await supabase
        .from('users')
        .update({ telegram_chat_id: chatId })
        .eq('id', connectUser.id)

      if (connectError) {
        await sendMessage(chatId, `Something went wrong: ${connectError.message}`)
        return NextResponse.json({ ok: true })
      }

      await sendMessage(chatId, 'Connected! You can now send me coding tasks.')
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

    let referenceImageBase64: string | null = null

    if (hasPhoto && message.photo) {
      const largest = message.photo[message.photo.length - 1]
      try {
        const downloaded = await downloadTelegramFile(largest.file_id)
        if (downloaded.base64.length > MAX_REFERENCE_IMAGE_BASE64_CHARS) {
          await sendMessage(chatId, 'Image too large, try a smaller screenshot')
          return NextResponse.json({ ok: true })
        }
        referenceImageBase64 = downloaded.base64
      } catch (err) {
        const detail = err instanceof Error ? err.message : 'Failed to download image'
        await sendMessage(chatId, `Couldn't download that image: ${detail}`)
        return NextResponse.json({ ok: true })
      }
    }

    const forceNew = text.toLowerCase().startsWith('/new ')
    const taskText = forceNew
      ? text.slice(5).trim()
      : text || (hasPhoto ? DEFAULT_PHOTO_PROMPT : '')

    if (!taskText && !forceNew) {
      await sendMessage(chatId, 'Tell me what you want changed — e.g. /new add a dark mode toggle')
      return NextResponse.json({ ok: true })
    }

    const { data: connectedRepos } = await supabase
      .from('repos')
      .select('id, full_name, name')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('created_at', { ascending: true })

    const repos = (connectedRepos ?? []) as ConnectedRepo[]

    if (repos.length === 0) {
      await sendMessage(
        chatId,
        'No active repo. Connect one in the Bopple dashboard first.'
      )
      return NextResponse.json({ ok: true })
    }

    const resolved = resolveRepoFromMessage(taskText || '', repos)

    let activeTaskForMatchedRepo: ContinuableTask | null = null
    if (resolved.status === 'matched') {
      activeTaskForMatchedRepo = await findActiveTaskForRepo(
        supabase,
        user.id,
        resolved.repo.full_name
      )
    }

    const openTaskNoRepo =
      resolved.status === 'default' && !forceNew
        ? await findTaskForReply(supabase, user.id, replyToMessageId)
        : null

    const decision = decideTelegramRoute({
      forceNew,
      resolved,
      activeTaskForMatchedRepo,
      openTaskNoRepo,
    })

    console.log(formatRouteLog(decision))

    if (decision.action === 'ask_ambiguous') {
      const options = decision.repos.map((r) => r.full_name).join(' or ')
      await sendMessage(chatId, `Did you mean ${options}?`)
      return NextResponse.json({ ok: true })
    }

    if (decision.action === 'unknown_repo') {
      await sendMessage(
        chatId,
        `I don't see a repo called ${decision.name} connected. Add it in the dashboard first.`
      )
      return NextResponse.json({ ok: true })
    }

    if (decision.action === 'feedback') {
      const openTask =
        (activeTaskForMatchedRepo && activeTaskForMatchedRepo.id === decision.taskId
          ? activeTaskForMatchedRepo
          : null) ??
        (openTaskNoRepo && openTaskNoRepo.id === decision.taskId ? openTaskNoRepo : null)

      if (!openTask) {
        // Shouldn't happen — re-fetch by id as a safety net.
        const { data: byId } = await supabase
          .from('tasks')
          .select(TASK_SELECT)
          .eq('id', decision.taskId)
          .maybeSingle()
        if (!byId) {
          console.error(`[telegram] feedback target missing taskId=${decision.taskId}`)
          await sendMessage(chatId, 'Could not find that task to continue. Try /new …')
          return NextResponse.json({ ok: true })
        }
        if (referenceImageBase64) {
          await supabase
            .from('tasks')
            .update({ reference_image_base64: referenceImageBase64 })
            .eq('id', byId.id)
        }
        await continueTaskWithFeedback(
          supabase,
          chatId,
          byId as ContinuableTask,
          taskText || DEFAULT_PHOTO_PROMPT,
          userMessageId
        )
        return NextResponse.json({ ok: true })
      }

      if (referenceImageBase64) {
        await supabase
          .from('tasks')
          .update({ reference_image_base64: referenceImageBase64 })
          .eq('id', openTask.id)
      }
      await continueTaskWithFeedback(
        supabase,
        chatId,
        openTask,
        taskText || DEFAULT_PHOTO_PROMPT,
        userMessageId
      )
      return NextResponse.json({ ok: true })
    }

    // --- new_task ---
    if (!taskText) {
      await sendMessage(chatId, 'Tell me what you want changed — e.g. /new add a dark mode toggle')
      return NextResponse.json({ ok: true })
    }

    const repo = decision.repo ?? repos[0]

    const { data: task, error: taskError } = await supabase
      .from('tasks')
      .insert({
        user_id: user.id,
        repo_id: repo.id,
        repo_full_name: repo.full_name,
        prompt: taskText,
        source: 'telegram',
        status: 'queued',
        telegram_chat_id: chatId,
        telegram_message_ids: userMessageId != null ? [userMessageId] : [],
        ...(referenceImageBase64
          ? { reference_image_base64: referenceImageBase64 }
          : {}),
      })
      .select('id')
      .single()

    if (taskError || !task) {
      await sendMessage(
        chatId,
        `Something went wrong: ${taskError?.message ?? 'Failed to create task'}`
      )
      return NextResponse.json({ ok: true })
    }

    await supabase.rpc('increment_tasks_used', { p_user_id: user.id })

    const queuedId = await sendTaskQueued(chatId, taskText)
    await appendTelegramMessageIds(supabase, task.id, [queuedId])
    await tasks.trigger(codingAgentJob.id, { taskId: task.id })

    return NextResponse.json({ ok: true })
  } catch (error) {
    if (chatId) {
      try {
        const errMessage =
          error instanceof Error ? error.message : 'Something went wrong'
        await sendMessage(chatId, `Something went wrong: ${errMessage}`)
      } catch {
        // Ignore secondary Telegram failures — still return 200.
      }
    }

    return NextResponse.json({ ok: true })
  }
}
