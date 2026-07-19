import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase-server'
import { decrypt } from '@/lib/crypto'
import { getPullRequestDiff } from '@/lib/github'

export async function GET(
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
      .select('id, user_id, repo_full_name, pr_number, diff_text')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (error || !task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    if (task.diff_text) {
      return NextResponse.json({ diff: task.diff_text })
    }

    if (!task.pr_number || !task.repo_full_name) {
      return NextResponse.json({ diff: null })
    }

    const { data: profile } = await serviceClient
      .from('users')
      .select('github_access_token')
      .eq('id', user.id)
      .single()

    if (!profile?.github_access_token) {
      return NextResponse.json({ diff: null })
    }

    const token = decrypt(profile.github_access_token)
    const diff = await getPullRequestDiff(token, task.repo_full_name, task.pr_number)

    // Backfill so subsequent loads don't hit GitHub again.
    await serviceClient.from('tasks').update({ diff_text: diff }).eq('id', id)

    return NextResponse.json({ diff })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load diff'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
