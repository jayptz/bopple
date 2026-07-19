const TELEGRAM_API_BASE = 'https://api.telegram.org'

interface TelegramApiResponse {
  ok: boolean
  description?: string
  result?: {
    message_id?: number
  }
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

export async function sendTaskQueued(chatId: string, prompt: string): Promise<void> {
  void prompt
  await sendMessage(
    chatId,
    "⏳ Got it. Working on your task now, I'll ping you when the PR is ready."
  )
}

export async function sendTaskDone(
  chatId: string,
  prUrl: string,
  prTitle: string,
  filesChanged: number,
  previewUrl?: string,
  messageId?: number | null
): Promise<void> {
  let text = `✅ Done!\n\n*${prTitle}*\n\n${filesChanged} files changed\n\n[Review PR →](${prUrl})`
  if (previewUrl) {
    text += `\n[Live Preview →](${previewUrl})`
  }

  if (messageId != null) {
    await editMessageText(chatId, messageId, text)
    return
  }

  await sendMessage(chatId, text)
}

export async function sendTaskFailed(chatId: string, error: string): Promise<void> {
  await sendMessage(chatId, `❌ Something went wrong: ${error}`)
}

export async function sendFeedbackRequest(chatId: string, question: string): Promise<void> {
  await sendMessage(
    chatId,
    `💬 *Need your input*\n\n${question}\n\n_Reply to this chat to continue._`
  )
}

export async function setWebhook(appUrl: string): Promise<string> {
  const webhookUrl = `${appUrl.replace(/\/$/, '')}/api/telegram`
  await telegramRequest('setWebhook', {
    url: webhookUrl,
    secret_token: process.env.TELEGRAM_WEBHOOK_SECRET,
  })
  return webhookUrl
}
