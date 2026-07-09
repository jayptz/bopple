import { task } from '@trigger.dev/sdk/v3'
import { createClient } from '@supabase/supabase-js'
import { getRepoContext, createBranch, commitFiles, openPullRequest } from '../lib/github'
import { generateCode } from '../lib/ai'
import { decrypt } from '../lib/crypto'
import { sendTaskDone, sendTaskFailed } from '../lib/telegram'
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
  run: async (payload: { taskId: string }) => {
    const supabase = getSupabase()
    const { taskId } = payload

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

    await supabase
      .from('tasks')
      .update({
        status: 'running',
        started_at: new Date().toISOString(),
      })
      .eq('id', taskId)

    try {
      const repoContext = await getRepoContext(githubToken, taskRow.repo_full_name)

      const apiKey = user.preferred_model.startsWith('gpt') ? openaiKey : anthropicKey
      const result = await generateCode({
        prompt: taskRow.prompt,
        repoContext,
        model: user.preferred_model,
        apiKey,
      })

      const branchName = `bopple/${taskId.slice(0, 8)}-${Date.now()}`
      await createBranch(githubToken, taskRow.repo_full_name, branchName)

      await commitFiles(
        githubToken,
        taskRow.repo_full_name,
        branchName,
        result.files,
        result.prTitle
      )

      const { url: prUrl, number: prNumber } = await openPullRequest(
        githubToken,
        taskRow.repo_full_name,
        branchName,
        result.prTitle,
        `${result.prBody}\n\n---\n*Created by [Bopple](https://bopple.dev)*`
      )

      const linesAdded = result.files.reduce(
        (acc, f) => acc + f.content.split('\n').length,
        0
      )

      await supabase
        .from('tasks')
        .update({
          status: 'done',
          branch_name: branchName,
          pr_url: prUrl,
          pr_number: prNumber,
          pr_title: result.prTitle,
          files_changed: result.files.length,
          lines_added: linesAdded,
          model_used: user.preferred_model,
          completed_at: new Date().toISOString(),
        })
        .eq('id', taskId)

      if (user.telegram_chat_id) {
        await sendTaskDone(
          user.telegram_chat_id,
          prUrl,
          result.prTitle,
          result.files.length,
          linesAdded
        )
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'

      await supabase
        .from('tasks')
        .update({
          status: 'failed',
          error_message: message,
          completed_at: new Date().toISOString(),
        })
        .eq('id', taskId)

      if (user.telegram_chat_id) {
        await sendTaskFailed(user.telegram_chat_id, taskRow.prompt, message)
      }

      throw error
    }
  },
})
