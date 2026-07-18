import { task } from '@trigger.dev/sdk/v3'
import { createClient } from '@supabase/supabase-js'
import { getDefaultBranch, openPullRequest } from '../lib/github'
import { decrypt } from '../lib/crypto'
import {
  sendTaskDone,
  sendTaskFailed,
  sendFeedbackRequest,
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
import type { User } from '../types'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export const codingAgentJob = task({
  id: 'coding-agent',
  retry: { maxAttempts: 2 },
  run: async (payload: { taskId: string; feedback?: string }) => {
    const supabase = getSupabase()
    const { taskId, feedback } = payload

    const { data: taskRow, error: fetchError } = await supabase
      .from('tasks')
      .select('*, users(*)')
      .eq('id', taskId)
      .single()

    if (fetchError || !taskRow) throw new Error('Task not found')

    const user = taskRow.users as User
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

    await supabase
      .from('tasks')
      .update({
        status: 'running',
        started_at: taskRow.started_at ?? new Date().toISOString(),
        error_message: null,
      })
      .eq('id', taskId)

    let session = null as Awaited<ReturnType<typeof createSandboxSession>> | null

    try {
      const defaultBranch = await getDefaultBranch(githubToken, taskRow.repo_full_name)
      const branchName =
        taskRow.branch_name ?? `bopple/${taskId.slice(0, 8)}-${Date.now()}`

      session = await createSandboxSession(taskRow.sandbox_id)

      if (feedback && taskRow.branch_name) {
        await cloneRepository(
          session,
          taskRow.repo_full_name,
          githubToken,
          defaultBranch,
          taskRow.branch_name
        )
      } else {
        await cloneRepository(
          session,
          taskRow.repo_full_name,
          githubToken,
          defaultBranch
        )
        await createWorkBranch(session, branchName)
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
      })

      const updatedConversation: AgentMessage[] = [
        ...priorMessages,
        ...(feedback ? [{ role: 'user' as const, content: feedback }] : []),
        ...agentResult.messages.filter(
          (m) => !priorMessages.some((p) => p.role === m.role && p.content === m.content)
        ),
      ]

      if (agentResult.needsFeedback) {
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
          lines_added: pushResult.linesAdded,
          diff: pushResult.diff,
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
          demo.demoUrl ?? undefined
        )
      }

      await closeSandbox(session, true)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'

      if (session) {
        await closeSandbox(session, false).catch(() => undefined)
      }

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
