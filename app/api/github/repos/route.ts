import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase-server'
import { getUserRepos } from '@/lib/github'
import { decrypt } from '@/lib/crypto'

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const serviceClient = createServiceClient()
  const { data: profile } = await serviceClient
    .from('users')
    .select('github_access_token, github_username')
    .eq('id', user.id)
    .single()

  if (!profile?.github_access_token) {
    return NextResponse.json({ error: 'No GitHub token' }, { status: 400 })
  }

  try {
    const token = decrypt(profile.github_access_token)
    const repos = await getUserRepos(token)

    const { data: savedRows } = await serviceClient
      .from('repos')
      .select('github_repo_id, is_active')
      .eq('user_id', user.id)
      .eq('is_active', true)

    const saved_repo_ids = (savedRows ?? []).map((r) => r.github_repo_id as number)

    return NextResponse.json({
      repos,
      github_username: profile.github_username as string,
      saved_repo_ids,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch repos'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await request.json()) as {
    repos: Array<{
      github_repo_id: number
      name: string
      full_name: string
      default_branch: string
      is_private: boolean
      is_active: boolean
    }>
  }

  const serviceClient = createServiceClient()

  await serviceClient.from('repos').delete().eq('user_id', user.id)

  if (body.repos.length > 0) {
    const { error } = await serviceClient.from('repos').insert(
      body.repos.map((repo) => ({
        user_id: user.id,
        github_repo_id: repo.github_repo_id,
        name: repo.name,
        full_name: repo.full_name,
        default_branch: repo.default_branch,
        is_private: repo.is_private,
        is_active: repo.is_active,
      }))
    )

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }

  return NextResponse.json({ ok: true })
}
