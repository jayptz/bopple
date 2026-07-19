import { task } from '@trigger.dev/sdk/v3'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import ws from 'ws'
import { getDefaultBranch, openPullRequest } from '../lib/github'
import { decrypt } from '../lib/crypto'
import {
  sendTaskDone,
  sendTaskFailed,
  sendTaskRunning,
  sendFeedbackRequest,
  sendPhoto,
  upsertProgressMessage,
} from '../lib/telegram'
import type { AgentMessage } from '../lib/agent'
import { runAgentLoop } from '../lib/agent'
import {
  closeSandbox,
  commitAndPush,
  createSandboxSession,
  getWorkingDiff,
  prepareRepo,
  pushBranch,
  tryGenerateDemo,
} from '../lib/sandbox'
import type { AgentLogEntry, AgentLogType, User } from '../types'

function getSupabase() {
  const url =
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url) {
    throw new Error(
      'Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) in Trigger.dev env'
    )
  }
  if (!key) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY in Trigger.dev env')
  }

  // Trigger workers run Node 21; supabase-js realtime needs a WebSocket impl.
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    realtime: {
      transport: ws as unknown as typeof WebSocket,
    },
  })
}

async function appendAgentLog(
  supabase: SupabaseClient,
  taskId: string,
  type: AgentLogType,
  message: string
): Promise<void> {
  const entry: AgentLogEntry = {
    timestamp: new Date().toISOString(),
    type,
    message,
  }

  const { error } = await supabase.rpc('append_agent_log', {
    p_task_id: taskId,
    p_entry: entry,
  })

  if (error) {
    // Fallback: non-atomic append if RPC isn't migrated yet
    const { data } = await supabase
      .from('tasks')
      .select('agent_logs')
      .eq('id', taskId)
      .single()

    const existing = (data?.agent_logs as AgentLogEntry[] | null) ?? []
    await supabase
      .from('tasks')
      .update({ agent_logs: [...existing, entry] })
      .eq('id', taskId)
  }
}

function toolLogFromCall(
  toolName: string,
  input: Record<string, unknown>
): { type: AgentLogType; message: string } {
  switch (toolName) {
    case 'read_file':
      return {
        type: 'reading',
        message: `Reading ${String(input.path ?? 'file')}...`,
      }
    case 'list_files':
      return {
        type: 'reading',
        message: `Listing ${String(input.path ?? '.')}...`,
      }
    case 'write_file':
      return {
        type: 'writing',
        message: `Writing ${String(input.path ?? 'file')}...`,
      }
    case 'bash': {
      const command = String(input.command ?? '').slice(0, 80)
      return {
        type: 'running',
        message: `Running: ${command}${command.length >= 80 ? '…' : ''}`,
      }
    }
    case 'ask_user':
      return {
        type: 'thinking',
        message: 'Asking for your input...',
      }
    case 'take_screenshot':
      return {
        type: 'running',
        message: `Queuing screenshot of ${String(input.route ?? '/')}...`,
      }
    case 'complete_task':
      return {
        type: 'thinking',
        message: 'Wrapping up changes...',
      }
    default:
      return {
        type: 'thinking',
        message: `Using tool: ${toolName}`,
      }
  }
}

export const codingAgentJob = task({
  id: 'coding-agent',
  retry: { maxAttempts: 2 },
  run: async (payload: { taskId: string; feedback?: string }) => {
    const supabase = getSupabase()
    const { taskId, feedback } = payload

    if (!taskId) {
      throw new Error(
        'Missing taskId in payload. Trigger with { "taskId": "<uuid>" } — empty {} will fail.'
      )
    }

    const { data: taskRow, error: fetchError } = await supabase
      .from('tasks')
      .select('*, users(*)')
      .eq('id', taskId)
      .single()

    if (fetchError || !taskRow) {
      throw new Error(
        `Task not found for id=${taskId}${fetchError ? `: ${fetchError.message}` : ''}`
      )
    }

    let user = taskRow.users as User | null

    // Telegram tasks may only have telegram_chat_id until linked
    if (!user && taskRow.telegram_chat_id) {
      const { data: byChat } = await supabase
        .from('users')
        .select('*')
        .eq('telegram_chat_id', taskRow.telegram_chat_id)
        .maybeSingle()
      user = byChat as User | null
    }

    if (!user) {
      throw new Error(
        `No user linked to task ${taskId}. Connect Telegram / ensure user_id is set.`
      )
    }
    const githubToken = user.github_access_token
      ? decrypt(user.github_access_token)
      : null
    let anthropicKey: string | undefined
    let openaiKey: string | undefined

    try {
      anthropicKey = user.anthropic_api_key
        ? decrypt(user.anthropic_api_key)
        : undefined
    } catch {
      throw new Error(
        'Failed to decrypt Anthropic API key. ENCRYPTION_KEY on Trigger.dev must match Vercel, then re-save your key in Settings.'
      )
    }

    try {
      openaiKey = user.openai_api_key ? decrypt(user.openai_api_key) : undefined
    } catch {
      throw new Error(
        'Failed to decrypt OpenAI API key. ENCRYPTION_KEY on Trigger.dev must match Vercel, then re-save your key in Settings.'
      )
    }

    if (!githubToken) throw new Error('No GitHub token')

    const usingByok = user.preferred_model.startsWith('gpt')
      ? Boolean(openaiKey)
      : Boolean(anthropicKey)

    const apiKey =
      user.preferred_model.startsWith('gpt')
        ? openaiKey ?? process.env.OPENAI_API_KEY
        : anthropicKey ?? process.env.ANTHROPIC_API_KEY

    if (!apiKey) {
      throw new Error(
        'No API key configured. Add ANTHROPIC_API_KEY in Trigger.dev Production env, or paste your key in Dashboard → Settings.'
      )
    }

    if (
      !user.preferred_model.startsWith('gpt') &&
      !apiKey.startsWith('sk-ant-')
    ) {
      throw new Error(
        `Anthropic API key looks invalid (source: ${usingByok ? 'Settings BYOK' : 'ANTHROPIC_API_KEY env'}). Re-save a valid sk-ant-… key.`
      )
    }

    const chatId = user.telegram_chat_id
    let progressMessageId: number | null = null
    let hasLoggedWriting = false

    async function updateTelegramProgress(text: string) {
      if (!chatId) return
      try {
        progressMessageId = await upsertProgressMessage(chatId, text, progressMessageId)
      } catch {
        // Don't fail the job if Telegram progress fails
      }
    }

    await supabase
      .from('tasks')
      .update({
        status: 'running',
        started_at: taskRow.started_at ?? new Date().toISOString(),
        error_message: null,
        agent_logs: feedback ? taskRow.agent_logs ?? [] : [],
      })
      .eq('id', taskId)

    // Mirror dashboard status=running in Telegram (same source of truth).
    if (chatId) {
      try {
        progressMessageId = await sendTaskRunning(chatId, progressMessageId)
      } catch {
        // Don't fail the job if Telegram notify fails
      }
    }

    const promptPreview = String(taskRow.prompt).slice(0, 120)
    await appendAgentLog(supabase, taskId, 'thinking', `Working on: ${promptPreview}`)
    await updateTelegramProgress(`🔄 *Running*\n\nWorking on: ${promptPreview}`)

    let session: import('../lib/sandbox').SandboxSession | null = null

    try {
      const defaultBranch = await getDefaultBranch(githubToken, taskRow.repo_full_name)
      const branchName =
        taskRow.branch_name ?? `bopple/${taskId.slice(0, 8)}-${Date.now()}`

      const { session: sandboxSession, resumed } = await createSandboxSession(
        taskRow.sandbox_id
      )
      session = sandboxSession
      await appendAgentLog(supabase, taskId, 'thinking', 'Spinning up VM...')

      const prepared = await prepareRepo(
        session,
        taskRow.repo_full_name,
        githubToken,
        defaultBranch,
        branchName,
        {
          resumed,
          continueBranch: Boolean(feedback && taskRow.branch_name),
        }
      )

      if (prepared.cloned) {
        await appendAgentLog(supabase, taskId, 'reading', 'Cloning repo...')
        await updateTelegramProgress(
          '🔄 *Running*\n\nCloning your repo and starting work...'
        )
        await appendAgentLog(supabase, taskId, 'thinking', 'Creating work branch...')
      } else {
        await appendAgentLog(supabase, taskId, 'reading', 'Resuming existing VM checkout...')
        await updateTelegramProgress('🔄 *Running*\n\nResuming your codebase...')
      }

      await supabase
        .from('tasks')
        .update({
          sandbox_id: session.sandbox.sandboxId,
          branch_name: branchName,
        })
        .eq('id', taskId)

      const priorMessages = (taskRow.conversation ?? []) as AgentMessage[]
      const agentPrompt = feedback ?? taskRow.prompt

      const agentResult = await runAgentLoop({
        session,
        prompt: agentPrompt,
        model: user.preferred_model,
        apiKey,
        priorMessages: feedback ? priorMessages : [],
        onToolCall: async (toolName, input) => {
          const log = toolLogFromCall(toolName, input)
          await appendAgentLog(supabase, taskId, log.type, log.message)

          if (toolName === 'write_file' && !hasLoggedWriting) {
            hasLoggedWriting = true
            await updateTelegramProgress('✏️ Writing code...')
          }

          // Keep the code panel in sync as files change.
          if (toolName === 'write_file') {
            try {
              if (!session) return
              const diffText = await getWorkingDiff(session)
              if (diffText) {
                await supabase.from('tasks').update({ diff_text: diffText }).eq('id', taskId)
              }
            } catch {
              // Best-effort — don't block the agent on diff snapshots.
            }
          }
        },
      })

      const updatedConversation: AgentMessage[] = [
        ...priorMessages,
        ...(feedback ? [{ role: 'user' as const, content: feedback }] : []),
        ...agentResult.messages.filter(
          (m) => !priorMessages.some((p) => p.role === m.role && p.content === m.content)
        ),
      ]

      if (agentResult.needsFeedback) {
        const feedbackQuestion =
          agentResult.feedbackPrompt?.trim() ||
          'I need a bit more info to continue. Reply in this chat.'

        await appendAgentLog(supabase, taskId, 'thinking', feedbackQuestion)

        // Persist WIP so resume works even if the VM expires.
        let wipDiff = ''
        try {
          const wip = await commitAndPush(
            session,
            githubToken,
            `wip(bopple): awaiting feedback`,
            branchName,
            taskRow.repo_full_name
          )
          wipDiff = wip.diffText
        } catch {
          try {
            await pushBranch(session, githubToken, branchName, taskRow.repo_full_name)
            wipDiff = await getWorkingDiff(session).catch(() => '')
          } catch {
            // Best-effort — sandbox resume can still recover local work.
          }
        }

        await supabase
          .from('tasks')
          .update({
            status: 'awaiting_feedback',
            conversation: updatedConversation,
            sandbox_id: session.sandbox.sandboxId,
            branch_name: branchName,
            ...(wipDiff ? { diff_text: wipDiff } : {}),
          })
          .eq('id', taskId)

        // Mirror dashboard status=awaiting_feedback with the real clarifying question.
        if (chatId) {
          try {
            await sendFeedbackRequest(chatId, feedbackQuestion)
          } catch {
            // Don't fail the job if Telegram notify fails
          }
        }

        await closeSandbox(session, true)
        return
      }

      await appendAgentLog(
        supabase,
        taskId,
        'committing',
        'Committing changes and pushing branch...'
      )

      const commitMessage = agentResult.prTitle
      const pushResult = await commitAndPush(
        session,
        githubToken,
        commitMessage,
        branchName,
        taskRow.repo_full_name
      )

      const demo = await tryGenerateDemo(session)

      // Best-effort screenshot: only when the user asked for one.
      let screenshotUrl: string | null = null
      if (agentResult.screenshotRoute && demo.demoUrl) {
        try {
          await appendAgentLog(
            supabase,
            taskId,
            'running',
            `Capturing screenshot of ${agentResult.screenshotRoute}...`
          )
          const { captureScreenshot, uploadScreenshot } = await import('../lib/screenshot')
          const png = await captureScreenshot(demo.demoUrl, agentResult.screenshotRoute)
          if (png) {
            screenshotUrl = await uploadScreenshot(supabase, taskId, png)
          }
        } catch {
          // Screenshot is optional — never block the PR on it.
        }
      }

      let prUrl = taskRow.pr_url
      let prNumber = taskRow.pr_number

      if (!prUrl) {
        const previewSection = screenshotUrl
          ? `\n\n## Preview\n\n![screenshot](${screenshotUrl})`
          : ''
        const pr = await openPullRequest(
          githubToken,
          taskRow.repo_full_name,
          branchName,
          agentResult.prTitle,
          `${agentResult.prBody}${previewSection}\n\n---\n*Created by [Bopple](https://bopple.dev)*`,
          defaultBranch
        )
        prUrl = pr.url
        prNumber = pr.number
      }

      await appendAgentLog(supabase, taskId, 'done', 'PR opened!')

      await supabase
        .from('tasks')
        .update({
          status: 'awaiting_feedback',
          conversation: updatedConversation,
          branch_name: branchName,
          pr_url: prUrl,
          pr_number: prNumber,
          pr_title: agentResult.prTitle,
          files_changed: pushResult.filesChanged,
          diff_text: pushResult.diffText || null,
          demo_url: demo.demoUrl,
          demo_logs: demo.demoLogs,
          screenshot_url: screenshotUrl,
          model_used: user.preferred_model,
          completed_at: new Date().toISOString(),
        })
        .eq('id', taskId)

      // Mirror dashboard completion fields (PR, files, demo) in Telegram.
      if (chatId && prUrl) {
        try {
          await sendTaskDone(
            chatId,
            prUrl,
            agentResult.prTitle,
            pushResult.filesChanged,
            demo.demoUrl ?? undefined,
            progressMessageId
          )
        } catch {
          // Don't fail the job if Telegram notify fails
        }
      }

      if (chatId && agentResult.screenshotRoute && screenshotUrl) {
        try {
          await sendPhoto(chatId, screenshotUrl, `📸 ${agentResult.prTitle}`)
        } catch {
          // Don't fail the job if the Telegram photo send fails
        }
      }

      await closeSandbox(session, true)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      const errorForUser = message.slice(0, 200)

      if (session) {
        await closeSandbox(session, false).catch(() => undefined)
      }

      await appendAgentLog(supabase, taskId, 'thinking', `Failed: ${errorForUser}`)

      await supabase
        .from('tasks')
        .update({
          status: 'failed',
          error_message: message,
          completed_at: new Date().toISOString(),
        })
        .eq('id', taskId)

      // Mirror dashboard status=failed + error_message (truncated) in Telegram.
      if (chatId) {
        try {
          await sendTaskFailed(chatId, errorForUser)
        } catch {
          // Don't fail the job if Telegram notify fails
        }
      }

      throw error
    }
  },
})
