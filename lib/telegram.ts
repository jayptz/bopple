const TELEGRAM_API_BASE = 'https://api.telegram.org'

interface TelegramApiResponse {
  ok: boolean
  description?: string
  result?: {
    message_id?: number
  }
}

/** Shared task fields used to keep Telegram in sync with the dashboard. */
export interface TaskTelegramSnapshot {
  status: 'queued' | 'running' | 'awaiting_feedback' | 'done' | 'failed'
  prompt?: string | null
  error_message?: string | null
  pr_url?: string | null
  pr_title?: string | null
  files_changed?: number | null
  demo_url?: string | null
  /** Clarifying question when status is awaiting_feedback without a PR yet. */
  feedback_question?: string | null
}

function getBotToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) {
    throw new Error('TELEGRAM_BOT_TOKEN is required')
  }
  return token
}

async function telegramRequest(
  method: string,
  body: Record<string, string | number | boolean | undefined>
): Promise<TelegramApiResponse> {
  const token = getBotToken()
  const response = await fetch(`${TELEGRAM_API_BASE}/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Telegram API ${method} failed: ${errorText}`)
  }

  const data = (await response.json()) as TelegramApiResponse
  if (!data.ok) {
    throw new Error(data.description ?? `Telegram API ${method} failed`)
  }
  return data
}

export async function sendMessage(chatId: string, text: string): Promise<number | null> {
  const data = await telegramRequest('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'Markdown',
  })
  return data.result?.message_id ?? null
}

export async function editMessageText(
  chatId: string,
  messageId: number,
  text: string
): Promise<void> {
  try {
    await telegramRequest('editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: 'Markdown',
    })
  } catch (error) {
    // Telegram rejects edits when content is unchanged — ignore that case.
    const message = error instanceof Error ? error.message : ''
    if (!message.includes('message is not modified')) {
      throw error
    }
  }
}

/** Send a new progress message, or edit the existing one to avoid spam. */
export async function upsertProgressMessage(
  chatId: string,
  text: string,
  messageId: number | null
): Promise<number | null> {
  if (messageId != null) {
    await editMessageText(chatId, messageId, text)
    return messageId
  }
  return sendMessage(chatId, text)
}

/** Format a Telegram message from the same task fields the dashboard reads. */
export function formatTaskStatusMessage(task: TaskTelegramSnapshot): string {
  switch (task.status) {
    case 'queued': {
      const preview = task.prompt?.trim().slice(0, 120)
      return preview
        ? `⏳ *Queued*\n\nGot it: ${preview}\n\nI'll update you as the agent works.`
        : "⏳ *Queued*\n\nGot it. I'll update you as the agent works."
    }
    case 'running':
      return '🔄 *Running*\n\nCloning your repo and starting work...'
    case 'awaiting_feedback': {
      if (task.pr_url) {
        const title = task.pr_title?.trim() || 'Pull request ready'
        const files =
          task.files_changed != null ? `\n\n${task.files_changed} files changed` : ''
        let text = `✅ *Done*\n\n*${title}*${files}\n\n[Review PR →](${task.pr_url})`
        if (task.demo_url) {
          text += `\n[Live Preview →](${task.demo_url})`
        }
        text += '\n\n_Reply here with feedback, or mark resolved in the dashboard._'
        return text
      }
      const question =
        task.feedback_question?.trim() ||
        'I need a bit more info to continue. Reply in this chat.'
      return `💬 *Needs input*\n\n${question}\n\n_Reply to this chat to continue._`
    }
    case 'done':
      return '✅ *Resolved*\n\nThis task is marked done.'
    case 'failed': {
      const detail =
        task.error_message?.trim().slice(0, 200) || 'Unknown error — check the dashboard.'
      return `❌ *Failed*\n\n${detail}`
    }
    default:
      return `Status: ${String((task as TaskTelegramSnapshot).status)}`
  }
}

export async function sendTaskQueued(chatId: string, prompt: string): Promise<void> {
  await sendMessage(
    chatId,
    formatTaskStatusMessage({ status: 'queued', prompt })
  )
}

export async function sendTaskRunning(
  chatId: string,
  messageId?: number | null
): Promise<number | null> {
  const text = formatTaskStatusMessage({ status: 'running' })
  if (messageId != null) {
    await editMessageText(chatId, messageId, text)
    return messageId
  }
  return sendMessage(chatId, text)
}

export async function sendTaskDone(
  chatId: string,
  prUrl: string,
  prTitle: string,
  filesChanged: number,
  previewUrl?: string,
  messageId?: number | null
): Promise<void> {
  const text = formatTaskStatusMessage({
    status: 'awaiting_feedback',
    pr_url: prUrl,
    pr_title: prTitle,
    files_changed: filesChanged,
    demo_url: previewUrl ?? null,
  })

  if (messageId != null) {
    await editMessageText(chatId, messageId, text)
    return
  }

  await sendMessage(chatId, text)
}

export async function sendTaskFailed(chatId: string, error: string): Promise<void> {
  await sendMessage(
    chatId,
    formatTaskStatusMessage({
      status: 'failed',
      error_message: error,
    })
  )
}

export async function sendFeedbackRequest(chatId: string, question: string): Promise<void> {
  await sendMessage(
    chatId,
    formatTaskStatusMessage({
      status: 'awaiting_feedback',
      feedback_question: question,
    })
  )
}

export async function sendTaskResolved(chatId: string): Promise<void> {
  await sendMessage(chatId, formatTaskStatusMessage({ status: 'done' }))
}

export async function setWebhook(appUrl: string): Promise<string> {
  const webhookUrl = `${appUrl.replace(/\/$/, '')}/api/telegram`
  await telegramRequest('setWebhook', {
    url: webhookUrl,
    secret_token: process.env.TELEGRAM_WEBHOOK_SECRET,
  })
  return webhookUrl
}
