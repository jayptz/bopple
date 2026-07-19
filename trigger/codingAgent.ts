import { task, logger } from '@trigger.dev/sdk/v3'
import { createClient } from '@supabase/supabase-js'
import { getDefaultBranch, openPullRequest } from '../lib/github'
import { decrypt } from '../lib/crypto'
import {
  sendMessage,
  sendPhoto,
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
  // The Trigger worker env exposes the URL as SUPABASE_URL; the Next.js app uses
  // the NEXT_PUBLIC_ name. Accept either so the task runs in both environments.
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  return createClient(url!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export const codingAgentJob = task({
  id: 'coding-agent',
  // No retries: this task is not idempotent. A retry re-clones from the default
  // branch, re-runs the agent, and tries to push the same branch name again over
  // now-diverged history — which fails with a non-fast-forward rejection (and
  // double-spends on the model). On failure, the user re-creates the task instead.
  retry: { maxAttempts: 1 },
  run: async (payload: { taskId: string; feedback?: string }) => {
    const supabase = getSupabase()
    const { taskId, feedback } = payload

    // Everything runs inside this try so that ANY failure — including the early
    // "Task not found" / decrypt / "No API key" throws below — writes a `failed`
    // status back to the row. Otherwise a run that dies before the first status
    // update leaves the task orphaned at 'queued' forever.
    let session = null as Awaited<ReturnType<typeof createSandboxSession>> | null
    let user: User | undefined

    try {
      const { data: taskRow, error: fetchError } = await supabase
        .from('tasks')
        .select('*, users(*)')
        .eq('id', taskId)
        .single()

      if (fetchError || !taskRow) throw new Error('Task not found')

      user = taskRow.users as User
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

      // Demo preview + screenshot are best-effort. Never let them abort the run —
      // the PR must still open even if the sandbox can't install deps or boot the
      // app in time.
      let demo: { demoUrl: string | null; demoLogs: string } = {
        demoUrl: null,
        demoLogs: '',
      }
      let screenshotUrl: string | null = null
      let screenshotNote: string | null = null
      try {
        demo = await tryGenerateDemo(session)

        // Capture a screenshot only when the user asked for one during the run.
        if (agentResult.screenshotRoute) {
          if (demo.demoUrl) {
            const { captureScreenshot, uploadScreenshot } = await import('../lib/screenshot')
            const png = await captureScreenshot(demo.demoUrl, agentResult.screenshotRoute)
            if (png) {
              screenshotUrl = await uploadScreenshot(supabase, taskId, png)
            }
            if (!screenshotUrl) {
              screenshotNote = "📸 I couldn't capture a screenshot of the running app this time."
            }
          } else {
            screenshotNote =
              '📸 No web preview to screenshot — this change has nothing visual to render.'
          }
        }
      } catch (demoError) {
        logger.warn('Demo/screenshot step failed; opening the PR anyway', {
          taskId,
          error: demoError instanceof Error ? demoError.message : String(demoError),
        })
        if (agentResult.screenshotRoute) {
          screenshotNote = "📸 I couldn't capture a screenshot of the running app this time."
        }
      }

      let prUrl = taskRow.pr_url
      let prNumber = taskRow.pr_number

      if (!prUrl) {
        // Embed the screenshot in the PR body when we captured one — it's a public
        // URL, so GitHub renders it inline for reviewers.
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

      const { error: doneError } = await supabase
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
          screenshot_url: screenshotUrl,
          demo_url: demo.demoUrl,
          demo_logs: demo.demoLogs,
          model_used: user.preferred_model,
          completed_at: new Date().toISOString(),
        })
        .eq('id', taskId)

      if (doneError) {
        // The work succeeded (PR is open) but persisting the final state failed —
        // e.g. a missing column. Surface it loudly instead of silently leaving the
        // row stuck at 'running'.
        logger.error('Failed to persist completed task state', {
          taskId,
          error: doneError.message,
        })
      }

      if (user.telegram_chat_id && prUrl) {
        await sendTaskDone(
          user.telegram_chat_id,
          prUrl,
          agentResult.prTitle,
          pushResult.filesChanged,
          demo.demoUrl ?? undefined
        )
      }

      if (user.telegram_chat_id && agentResult.screenshotRoute) {
        if (screenshotUrl) {
          await sendPhoto(user.telegram_chat_id, screenshotUrl, `📸 ${agentResult.prTitle}`)
        } else if (screenshotNote) {
          await sendMessage(user.telegram_chat_id, screenshotNote)
        }
      }

      await closeSandbox(session, true)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'

      if (session) {
        await closeSandbox(session, false).catch(() => undefined)
      }

      const { error: failError } = await supabase
        .from('tasks')
        .update({
          status: 'failed',
          error_message: message,
          completed_at: new Date().toISOString(),
        })
        .eq('id', taskId)

      if (failError) {
        logger.error('Failed to persist failed task state', {
          taskId,
          error: failError.message,
        })
      }

      if (user?.telegram_chat_id) {
        await sendTaskFailed(user.telegram_chat_id, message)
      }

      throw error
    }
  },
})
