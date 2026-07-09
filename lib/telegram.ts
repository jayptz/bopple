import TelegramBot from 'node-telegram-bot-api'

let bot: TelegramBot | null = null

function getBot(): TelegramBot {
  if (!bot) {
    const token = process.env.TELEGRAM_BOT_TOKEN
    if (!token) throw new Error('TELEGRAM_BOT_TOKEN is required')
    bot = new TelegramBot(token, { polling: false })
  }
  return bot
}

export async function sendMessage(chatId: string, text: string) {
  await getBot().sendMessage(chatId, text, { parse_mode: 'Markdown' })
}

export async function sendTaskQueued(chatId: string, prompt: string) {
  await sendMessage(
    chatId,
    `⏳ *Task queued*\n\n"${prompt.slice(0, 100)}"\n\nI'll ping you when the PR is ready.`
  )
}

export async function sendTaskDone(
  chatId: string,
  prUrl: string,
  prTitle: string,
  filesChanged: number,
  linesAdded: number,
  demoUrl?: string | null
) {
  const demoLine = demoUrl ? `\n\n[Live preview →](${demoUrl}) _(temporary)_` : ''
  await sendMessage(
    chatId,
    `✅ *PR ready for review*\n\n*${prTitle}*\n\n${filesChanged} files changed, +${linesAdded} lines\n\n[Review PR →](${prUrl})${demoLine}\n\n_Reply with feedback to iterate, or send a new message for a fresh task._`
  )
}

export async function sendFeedbackRequest(chatId: string, question: string) {
  await sendMessage(
    chatId,
    `💬 *Need your input*\n\n${question}\n\n_Reply to this chat to continue._`
  )
}

export async function sendTaskFailed(chatId: string, prompt: string, error: string) {
  await sendMessage(
    chatId,
    `❌ *Task failed*\n\n"${prompt.slice(0, 100)}"\n\nError: ${error.slice(0, 200)}`
  )
}

export async function sendConnectInstructions(chatId: string) {
  await sendMessage(
    chatId,
    '👋 *Welcome to Bopple*\n\nConnect your account first:\n1. Go to Settings in the dashboard\n2. Copy your connect token\n3. Send `/connect YOUR_TOKEN` here'
  )
}

export async function sendWelcome(chatId: string, username: string) {
  await sendMessage(
    chatId,
    `✅ *Connected as @${username}*\n\nSend me any coding task and I'll open a PR when it's done.`
  )
}

export async function sendTaskLimitReached(chatId: string) {
  await sendMessage(
    chatId,
    '⚠️ *Task limit reached*\n\nUpgrade to Pro or wait until next month to send more tasks.'
  )
}

export async function sendNoRepo(chatId: string) {
  await sendMessage(
    chatId,
    '⚠️ *No active repo*\n\nConnect a repo in the Bopple dashboard first.'
  )
}

export async function setWebhook(url: string) {
  await getBot().setWebHook(url, {
    secret_token: process.env.TELEGRAM_WEBHOOK_SECRET,
  })
}
