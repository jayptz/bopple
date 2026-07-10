const TELEGRAM_API_BASE = 'https://api.telegram.org'

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
): Promise<void> {
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

  const data = (await response.json()) as { ok: boolean; description?: string }
  if (!data.ok) {
    throw new Error(data.description ?? `Telegram API ${method} failed`)
  }
}

export async function sendMessage(chatId: string, text: string): Promise<void> {
  await telegramRequest('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'Markdown',
  })
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
  previewUrl?: string
): Promise<void> {
  let text = `✅ Done!\n\n*${prTitle}*\n\n${filesChanged} files changed\n\n[Review PR →](${prUrl})`
  if (previewUrl) {
    text += `\n[Live Preview →](${previewUrl})`
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
