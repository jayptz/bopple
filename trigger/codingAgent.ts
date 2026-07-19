import { task } from '@trigger.dev/sdk/v3'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import ws from 'ws'
import { getDefaultBranch, openPullRequest } from '../lib/github'
import { decrypt } from '../lib/crypto'
import {
  sendTaskDone,
  sendTaskFailed,
  sendFeedbackRequest,
  upsertProgressMessage,
} from '../lib/telegram'
import type { AgentMessage } from '../lib/agent'
import { runAgentLoop } from '../lib/agent'
import {
  cloneRepository,
  closeSandbox,
  commitAndPush,
  createSandboxSession,
  createWorkBranch,
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
    const anthropicKey = user.anthropic_api_key
      ? decrypt(user.anthropic_api_key)
      : undefined
    const openaiKey = user.openai_api_key ? decrypt(user.openai_api_key) : undefined

    if (!githubToken) throw new Error('No GitHub token')

    const apiKey =
      user.preferred_model.startsWith('gpt')
        ? openaiKey ?? process.env.OPENAI_API_KEY
        : anthropicKey ?? process.env.ANTHROPIC_API_KEY

    if (!apiKey) throw new Error('No API key configured')

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

    const promptPreview = String(taskRow.prompt).slice(0, 120)
    await appendAgentLog(supabase, taskId, 'thinking', `Working on: ${promptPreview}`)
    await updateTelegramProgress(`🤔 Working on: ${promptPreview}`)

    let session = null as Awaited<ReturnType<typeof createSandboxSession>> | null

    try {
      const defaultBranch = await getDefaultBranch(githubToken, taskRow.repo_full_name)
      const branchName =
        taskRow.branch_name ?? `bopple/${taskId.slice(0, 8)}-${Date.now()}`

      session = await createSandboxSession(taskRow.sandbox_id)
      await appendAgentLog(supabase, taskId, 'thinking', 'Spinning up VM...')

      if (feedback && taskRow.branch_name) {
        await cloneRepository(
          session,
          taskRow.repo_full_name,
          githubToken,
          defaultBranch,
          taskRow.branch_name
        )
        await appendAgentLog(supabase, taskId, 'reading', 'Cloning repo...')
        await updateTelegramProgress('📖 Reading your codebase...')
      } else {
        await cloneRepository(
          session,
          taskRow.repo_full_name,
          githubToken,
          defaultBranch
        )
        await appendAgentLog(supabase, taskId, 'reading', 'Cloning repo...')
        await updateTelegramProgress('📖 Reading your codebase...')
        await createWorkBranch(session, branchName)
        await appendAgentLog(supabase, taskId, 'thinking', 'Creating work branch...')
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
        await appendAgentLog(
          supabase,
          taskId,
          'thinking',
          agentResult.feedbackPrompt ?? 'Waiting for your feedback...'
        )

        await supabase
          .from('tasks')
          .update({
            status: 'awaiting_feedback',
            conversation: updatedConversation,
            sandbox_id: session.sandbox.sandboxId,
          })
          .eq('id', taskId)

        if (user.telegram_chat_id && agentResult.feedbackPrompt) {
          await sendFeedbackRequest(user.telegram_chat_id, agentResult.feedbackPrompt)
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

      let prUrl = taskRow.pr_url
      let prNumber = taskRow.pr_number

      if (!prUrl) {
        const pr = await openPullRequest(
          githubToken,
          taskRow.repo_full_name,
          branchName,
          agentResult.prTitle,
          `${agentResult.prBody}\n\n---\n*Created by [Bopple](https://bopple.dev)*`,
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
          demo_url: demo.demoUrl,
          demo_logs: demo.demoLogs,
          model_used: user.preferred_model,
          completed_at: new Date().toISOString(),
        })
        .eq('id', taskId)

      if (user.telegram_chat_id && prUrl) {
        await sendTaskDone(
          user.telegram_chat_id,
          prUrl,
          agentResult.prTitle,
          pushResult.filesChanged,
          demo.demoUrl ?? undefined,
          progressMessageId
        )
      }

      await closeSandbox(session, true)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'

      if (session) {
        await closeSandbox(session, false).catch(() => undefined)
      }

      await appendAgentLog(supabase, taskId, 'thinking', `Failed: ${message.slice(0, 200)}`)

      await supabase
        .from('tasks')
        .update({
          status: 'failed',
          error_message: message,
          completed_at: new Date().toISOString(),
        })
        .eq('id', taskId)

      if (user.telegram_chat_id) {
        await sendTaskFailed(user.telegram_chat_id, message)
      }

      throw error
    }
  },
})
