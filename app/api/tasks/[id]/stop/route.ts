import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase-server'
import { sendMessage } from '@/lib/telegram'

/**
 * Request a soft interrupt on a running/queued task.
 * The agent finishes the current tool call, then pauses as awaiting_feedback.
 */
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
      .select('id, status, user_id, telegram_chat_id')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (error || !task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    if (!['running', 'queued'].includes(task.status)) {
      return NextResponse.json(
        { error: 'Only running or queued tasks can be stopped' },
        { status: 400 }
      )
    }

    const now = new Date().toISOString()
    const { data: updated, error: updateError } = await serviceClient
      .from('tasks')
      .update({ interrupt_requested_at: now })
      .eq('id', id)
      .select()
      .single()

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    // Notify Telegram if linked — agent will send the precise stop point later.
    const chatId = task.telegram_chat_id as string | null
    if (chatId) {
      try {
        await sendMessage(
          chatId,
          'Stop requested — finishing the current step, then pausing.'
        )
      } catch {
        // Don't block stop on Telegram failures
      }
    }

    return NextResponse.json({ ok: true, task: updated })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to stop task'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
