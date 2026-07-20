import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase-server'
import { tasks } from '@trigger.dev/sdk/v3'
import { codingAgentJob } from '@/trigger/codingAgent'
import { sendTaskQueued } from '@/lib/telegram'
import type { FeedbackEntry } from '@/types'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await request.json()) as { feedback: string }
    const feedback = body.feedback?.trim()

    if (!feedback) {
      return NextResponse.json({ error: 'Feedback is required' }, { status: 400 })
    }

    const serviceClient = createServiceClient()
    const { data: task, error } = await serviceClient
      .from('tasks')
      .select('id, status, feedback_history, user_id, prompt')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (error || !task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    if (!['awaiting_feedback', 'running', 'done'].includes(task.status)) {
      return NextResponse.json(
        { error: 'This task is not accepting feedback right now' },
        { status: 400 }
      )
    }

    const entry: FeedbackEntry = {
      timestamp: new Date().toISOString(),
      message: feedback,
    }
    const history = [...((task.feedback_history as FeedbackEntry[] | null) ?? []), entry]

    const { data: updated, error: updateError } = await serviceClient
      .from('tasks')
      .update({
        status: 'queued',
        feedback_history: history,
        error_message: null,
      })
      .eq('id', id)
      .select()
      .single()

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    const { data: profile } = await serviceClient
      .from('users')
      .select('telegram_chat_id')
      .eq('id', user.id)
      .single()

    if (profile?.telegram_chat_id) {
      try {
        await sendTaskQueued(profile.telegram_chat_id, feedback, { isFollowUp: true })
      } catch {
        // Don't block feedback if Telegram notify fails
      }
    }

    await tasks.trigger(codingAgentJob.id, { taskId: id, feedback })

    return NextResponse.json({ ok: true, task: updated })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to send feedback'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
