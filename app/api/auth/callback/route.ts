import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase-server'
import { encrypt } from '@/lib/crypto'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const nextParam = searchParams.get('next')
  const next =
    nextParam && nextParam.startsWith('/') && !nextParam.startsWith('//')
      ? nextParam
      : '/dashboard'

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`)
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.exchangeCodeForSession(code)

  if (error || !data.session) {
    return NextResponse.redirect(`${origin}/login?error=auth_failed`)
  }

  const { user, session } = data
  const metadata = user.user_metadata
  const githubId =
    metadata.provider_id ?? metadata.sub ?? user.id
  const githubUsername =
    metadata.user_name ?? metadata.preferred_username ?? metadata.name ?? 'unknown'
  const avatarUrl = metadata.avatar_url ?? null
  const accessToken = session.provider_token

  if (accessToken) {
    const serviceClient = createServiceClient()
    const { error: upsertError } = await serviceClient.from('users').upsert(
      {
        id: user.id,
        github_id: String(githubId),
        github_username: githubUsername,
        github_access_token: encrypt(accessToken),
        github_avatar_url: avatarUrl,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    )

    if (upsertError) {
      console.error('Failed to upsert user:', upsertError.message)
    }
  }

  return NextResponse.redirect(`${origin}${next}`)
}
