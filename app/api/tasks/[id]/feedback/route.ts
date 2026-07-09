import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { tasks } from '@trigger.dev/sdk/v3'
import { codingAgentJob } from '@/trigger/codingAgent'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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

  const { data: task, error } = await supabase
    .from('tasks')
    .select('id, status')
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

  await supabase.from('tasks').update({ status: 'queued' }).eq('id', id)
  await tasks.trigger(codingAgentJob.id, { taskId: id, feedback })

  return NextResponse.json({ ok: true })
}
