import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase-server'
import { tasks } from '@trigger.dev/sdk/v3'
import { codingAgentJob } from '@/trigger/codingAgent'
import type { User } from '@/types'

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: taskList, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ tasks: taskList })
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await request.json()) as { prompt: string; repo_id: string }
  const serviceClient = createServiceClient()

  const { data: profile } = await serviceClient
    .from('users')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  const typedProfile = profile as User

  if (typedProfile.tasks_used_this_month >= typedProfile.tasks_limit) {
    return NextResponse.json({ error: 'Task limit reached' }, { status: 429 })
  }

  const { data: repo } = await serviceClient
    .from('repos')
    .select('*')
    .eq('id', body.repo_id)
    .eq('user_id', user.id)
    .single()

  if (!repo) {
    return NextResponse.json({ error: 'Repo not found' }, { status: 404 })
  }

  const { data: task, error: taskError } = await serviceClient
    .from('tasks')
    .insert({
      user_id: user.id,
      repo_id: repo.id,
      repo_full_name: repo.full_name,
      prompt: body.prompt,
      source: 'dashboard',
    })
    .select()
    .single()

  if (taskError || !task) {
    return NextResponse.json(
      { error: taskError?.message ?? 'Failed to create task' },
      { status: 500 }
    )
  }

  await serviceClient
    .from('users')
    .update({ tasks_used_this_month: typedProfile.tasks_used_this_month + 1 })
    .eq('id', user.id)

  await tasks.trigger(codingAgentJob.id, { taskId: task.id })

  return NextResponse.json({ task })
}
