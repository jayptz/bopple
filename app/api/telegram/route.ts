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
}

type ConnectedRepo = {
  id: string
  full_name: string
  name: string
}

/** Words that often follow on/in/for but are not repo names. */
const REPO_HINT_STOPWORDS = new Set([
  'the',
  'a',
  'an',
  'my',
  'your',
  'our',
  'their',
  'this',
  'that',
  'these',
  'those',
  'it',
  'me',
  'us',
  'code',
  'codebase',
  'repo',
  'repository',
  'project',
  'app',
  'file',
  'files',
  'folder',
  'page',
  'pages',
  'website',
  'readme',
  'pr',
  'branch',
  'main',
  'master',
  'here',
  'there',
  'general',
  'production',
  'staging',
  'dashboard',
  'settings',
])

function shortRepoName(fullName: string): string {
  const parts = fullName.split('/')
  return (parts[parts.length - 1] ?? fullName).toLowerCase()
}

/**
 * Resolve which connected repo a natural-language Telegram message refers to.
 * Matches short names (e.g. "bopple" from "jayptz/bopple") as whole words.
 */
function resolveRepoFromMessage(
  message: string,
  connected: ConnectedRepo[]
):
  | { status: 'matched'; repo: ConnectedRepo }
  | { status: 'default' }
  | { status: 'ambiguous'; repos: ConnectedRepo[] }
  | { status: 'unknown'; name: string } {
  if (connected.length === 0) return { status: 'default' }

  const lower = message.toLowerCase()

  // Prefer longer names first so "my-app-web" wins over "web".
  const byName = [...connected].sort(
    (a, b) => shortRepoName(b.full_name).length - shortRepoName(a.full_name).length
  )

  const matched: ConnectedRepo[] = []
  const seenIds = new Set<string>()

  for (const repo of byName) {
    const short = shortRepoName(repo.full_name)
    if (!short) continue

    // Whole-word / boundary-ish match; allow hyphens/underscores/dots in the name.
    const escaped = short.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const wholeWord = new RegExp(`(?:^|[^a-z0-9_])${escaped}(?:[^a-z0-9_]|$)`, 'i')
    const fullEscaped = repo.full_name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const fullName = new RegExp(`(?:^|[^a-z0-9_])${fullEscaped}(?:[^a-z0-9_]|$)`, 'i')

    if (wholeWord.test(lower) || fullName.test(lower)) {
      if (!seenIds.has(repo.id)) {
        seenIds.add(repo.id)
        matched.push(repo)
      }
    }
  }

  if (matched.length === 1) return { status: 'matched', repo: matched[0] }
  if (matched.length > 1) return { status: 'ambiguous', repos: matched }

  // No connected repo found — check explicit "on/in/for <name>" hints for typos.
  const hintRe = /\b(?:on|in|for)\s+([a-z0-9][a-z0-9._-]*)\b/gi
  const hints: string[] = []
  let hintMatch: RegExpExecArray | null
  while ((hintMatch = hintRe.exec(lower)) !== null) {
    const name = hintMatch[1]
    if (!REPO_HINT_STOPWORDS.has(name)) hints.push(name)
  }

  const connectedShort = new Set(connected.map((r) => shortRepoName(r.full_name)))
  for (const hint of hints) {
    if (!connectedShort.has(hint)) {
      return { status: 'unknown', name: hint }
    }
  }

  return { status: 'default' }
}

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

async function findTaskForReply(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  replyToMessageId: number | undefined
): Promise<ContinuableTask | null> {
  // 1) Exact match: user replied to a message we linked to a task
  //    (their original prompt OR any bot progress/done message).
  if (replyToMessageId != null) {
    const { data: byReply } = await supabase
      .from('tasks')
      .select('id, status, feedback_history, branch_name, prompt, telegram_message_ids')
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
    .select('id, status, feedback_history, branch_name, prompt, telegram_message_ids')
    .eq('user_id', userId)
    .eq('status', 'awaiting_feedback')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (awaiting) return awaiting as ContinuableTask

  // 3) Explicit Telegram reply but no ID match yet (e.g. column not migrated /
  //    older tasks) — still continue the most recent unfinished task.
  if (replyToMessageId != null) {
    const { data: recent } = await supabase
      .from('tasks')
      .select('id, status, feedback_history, branch_name, prompt, telegram_message_ids')
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
    await sendMessage(chatId, `❌ Something went wrong: ${feedbackError.message}`)
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

    // Commands are text-only (ignore accidental photos attached to /start etc.)
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
        "Send me a coding task in plain English and I'll write the code, open a PR, and ping you when it's done.\n\nYou can also send a *screenshot* with a caption — I'll use it as a visual reference.\n\nMention a connected repo by name — e.g. _on bopple fix the timeout_ or _add a project to hotspots_. No repo name? I'll use your default.\n\nTo tweak a PR, *reply* to my message (or just send feedback while a task needs input) — I'll keep going on the same branch.\n\nSay /new before a message if you want to start a brand new task instead.\n\nFirst time? Copy `/connect <token>` from Bopple Settings and send it here."
      )
      return NextResponse.json({ ok: true })
    }

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
        await sendMessage(chatId, `❌ Something went wrong: ${connectError.message}`)
        return NextResponse.json({ ok: true })
      }

      await sendMessage(chatId, '✅ Connected! You can now send me coding tasks.')
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
      // Telegram sends multiple sizes — last element is the largest.
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
        await sendMessage(chatId, `❌ Couldn't download that image: ${detail}`)
        return NextResponse.json({ ok: true })
      }
    }

    // Force a brand-new task: "/new make the navbar blue"
    const forceNew = text.toLowerCase().startsWith('/new ')
    const taskText = forceNew
      ? text.slice(5).trim()
      : text || (hasPhoto ? DEFAULT_PHOTO_PROMPT : '')

    if (!forceNew) {
      const openTask = await findTaskForReply(supabase, user.id, replyToMessageId)
      if (openTask) {
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
    }

    if (!taskText) {
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
        '⚠️ No active repo. Connect one in the Bopple dashboard first.'
      )
      return NextResponse.json({ ok: true })
    }

    const resolved = resolveRepoFromMessage(taskText, repos)

    if (resolved.status === 'ambiguous') {
      const options = resolved.repos.map((r) => r.full_name).join(' or ')
      await sendMessage(chatId, `Did you mean ${options}?`)
      return NextResponse.json({ ok: true })
    }

    if (resolved.status === 'unknown') {
      await sendMessage(
        chatId,
        `I don't see a repo called ${resolved.name} connected. Add it in the dashboard first.`
      )
      return NextResponse.json({ ok: true })
    }

    const repo =
      resolved.status === 'matched'
        ? resolved.repo
        : repos[0]

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
        `❌ Something went wrong: ${taskError?.message ?? 'Failed to create task'}`
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
        await sendMessage(chatId, `❌ Something went wrong: ${errMessage}`)
      } catch {
        // Ignore secondary Telegram failures — still return 200.
      }
    }

    return NextResponse.json({ ok: true })
  }
}
