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

/** Show the Telegram "typing…" indicator while the agent works. */
export async function sendTypingAction(chatId: string): Promise<void> {
  try {
    await telegramRequest('sendChatAction', {
      chat_id: chatId,
      action: 'typing',
    })
  } catch {
    // Never block the agent on typing indicators.
  }
}

export async function sendPhoto(
  chatId: string,
  photoUrl: string,
  caption?: string
): Promise<void> {
  await telegramRequest('sendPhoto', {
    chat_id: chatId,
    photo: photoUrl,
    caption,
    parse_mode: 'Markdown',
  })
}

export type TelegramImageMediaType =
  | 'image/jpeg'
  | 'image/png'
  | 'image/gif'
  | 'image/webp'

function mediaTypeFromPath(filePath: string): TelegramImageMediaType {
  const lower = filePath.toLowerCase()
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.gif')) return 'image/gif'
  if (lower.endsWith('.webp')) return 'image/webp'
  return 'image/jpeg'
}

/** Download a Telegram file by file_id and return base64 bytes. */
export async function downloadTelegramFile(fileId: string): Promise<{
  base64: string
  mediaType: TelegramImageMediaType
  byteLength: number
}> {
  const token = getBotToken()

  const metaRes = await fetch(`${TELEGRAM_API_BASE}/bot${token}/getFile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file_id: fileId }),
  })

  if (!metaRes.ok) {
    const errorText = await metaRes.text()
    throw new Error(`Telegram getFile failed: ${errorText}`)
  }

  const meta = (await metaRes.json()) as {
    ok: boolean
    description?: string
    result?: { file_path?: string }
  }

  if (!meta.ok || !meta.result?.file_path) {
    throw new Error(meta.description ?? 'Telegram getFile returned no file_path')
  }

  const filePath = meta.result.file_path
  const fileRes = await fetch(`${TELEGRAM_API_BASE}/file/bot${token}/${filePath}`)
  if (!fileRes.ok) {
    const errorText = await fileRes.text()
    throw new Error(`Telegram file download failed: ${errorText}`)
  }

  const buffer = Buffer.from(await fileRes.arrayBuffer())
  return {
    base64: buffer.toString('base64'),
    mediaType: mediaTypeFromPath(filePath),
    byteLength: buffer.byteLength,
  }
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
      const preview = task.prompt?.trim().slice(0, 100)
      return preview
        ? `On it — let me take a look at ${preview}`
        : "On it — let me take a look."
    }
    case 'running':
      return 'Working through your codebase now...'
    case 'awaiting_feedback': {
      if (task.pr_url) {
        const title = task.pr_title?.trim() || 'Pull request ready'
        const files =
          task.files_changed != null ? `\n\n${task.files_changed} files changed` : ''
        let text = `✅ Done!\n\n*${title}*${files}\n\n[Review PR →](${task.pr_url})`
        if (task.demo_url) {
          text += `\n[Live Preview →](${task.demo_url})`
        }
        text += '\n\n_Reply here with feedback and I\'ll keep going on the same branch._'
        return text
      }
      const question =
        task.feedback_question?.trim() ||
        'I need a bit more info to continue. Reply in this chat.'
      return `💬 ${question}\n\n_Just reply here — I\'ll pick it up on the same task._`
    }
    case 'done':
      return 'All set — marked this one resolved.'
    case 'failed': {
      const detail =
        task.error_message?.trim().slice(0, 200) || 'Something went wrong — check the dashboard.'
      return `❌ Hit a snag:\n\n${detail}`
    }
    default:
      return `Status: ${String((task as TaskTelegramSnapshot).status)}`
  }
}

export async function sendTaskQueued(chatId: string, prompt: string): Promise<number | null> {
  return sendMessage(
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
): Promise<number | null> {
  const text = formatTaskStatusMessage({
    status: 'awaiting_feedback',
    pr_url: prUrl,
    pr_title: prTitle,
    files_changed: filesChanged,
    demo_url: previewUrl ?? null,
  })

  if (messageId != null) {
    await editMessageText(chatId, messageId, text)
    return messageId
  }

  return sendMessage(chatId, text)
}

export async function sendTaskFailed(chatId: string, error: string): Promise<number | null> {
  return sendMessage(
    chatId,
    formatTaskStatusMessage({
      status: 'failed',
      error_message: error,
    })
  )
}

export async function sendFeedbackRequest(
  chatId: string,
  question: string
): Promise<number | null> {
  return sendMessage(
    chatId,
    formatTaskStatusMessage({
      status: 'awaiting_feedback',
      feedback_question: question,
    })
  )
}

export async function sendTaskResolved(chatId: string): Promise<number | null> {
  return sendMessage(chatId, formatTaskStatusMessage({ status: 'done' }))
}

export async function setWebhook(appUrl: string): Promise<string> {
  const webhookUrl = `${appUrl.replace(/\/$/, '')}/api/telegram`
  await telegramRequest('setWebhook', {
    url: webhookUrl,
    secret_token: process.env.TELEGRAM_WEBHOOK_SECRET,
  })
  return webhookUrl
}
