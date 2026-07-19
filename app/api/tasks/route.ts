import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase-server'
import { tasks } from '@trigger.dev/sdk/v3'
import { codingAgentJob } from '@/trigger/codingAgent'
import type { User } from '@/types'

export async function GET() {
  try {
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
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load tasks'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await request.json()) as { prompt?: string; repo_id?: string }

    if (!body.prompt?.trim() || !body.repo_id) {
      return NextResponse.json(
        { error: 'prompt and repo_id are required' },
        { status: 400 }
      )
    }

    const serviceClient = createServiceClient()

    const { data: profile, error: profileError } = await serviceClient
      .from('users')
      .select('*')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json(
        { error: profileError?.message ?? 'User not found' },
        { status: 404 }
      )
    }

    const typedProfile = profile as User

    if (typedProfile.preferred_model.startsWith('gpt')) {
      return NextResponse.json(
        { error: 'VM agents currently require a Claude model. Switch in Settings.' },
        { status: 400 }
      )
    }

    const { data: repo, error: repoError } = await serviceClient
      .from('repos')
      .select('*')
      .eq('id', body.repo_id)
      .eq('user_id', user.id)
      .single()

    if (repoError || !repo) {
      return NextResponse.json(
        { error: repoError?.message ?? 'Repo not found' },
        { status: 404 }
      )
    }

    const { data: task, error: taskError } = await serviceClient
      .from('tasks')
      .insert({
        user_id: user.id,
        repo_id: repo.id,
        repo_full_name: repo.full_name,
        prompt: body.prompt.trim(),
        source: 'dashboard',
        status: 'queued',
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

    try {
      const handle = await tasks.trigger(codingAgentJob.id, { taskId: task.id })
      await serviceClient
        .from('tasks')
        .update({ trigger_run_id: handle.id })
        .eq('id', task.id)
    } catch (triggerError) {
      const message =
        triggerError instanceof Error
          ? triggerError.message
          : 'Failed to start agent job'
      await serviceClient
        .from('tasks')
        .update({
          status: 'failed',
          error_message: `Trigger failed: ${message}`,
        })
        .eq('id', task.id)

      return NextResponse.json(
        {
          error: `Task saved but agent failed to start: ${message}. Check TRIGGER_SECRET_KEY on Vercel.`,
        },
        { status: 502 }
      )
    }

    return NextResponse.json({ task })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create task'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
