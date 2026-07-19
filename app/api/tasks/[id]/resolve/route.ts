import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase-server'

export async function POST(
  _request: Request,
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

    const serviceClient = createServiceClient()
    const { data: task, error } = await serviceClient
      .from('tasks')
      .select('id, status')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (error || !task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    if (['queued', 'running'].includes(task.status)) {
      return NextResponse.json(
        { error: 'Wait for the agent to finish before resolving' },
        { status: 400 }
      )
    }

    const { data: updated, error: updateError } = await serviceClient
      .from('tasks')
      .update({
        status: 'done',
        completed_at: new Date().toISOString(),
        error_message: null,
      })
      .eq('id', id)
      .select()
      .single()

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, task: updated })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to resolve task'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
