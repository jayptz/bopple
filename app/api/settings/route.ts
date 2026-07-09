import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase-server'
import { encrypt } from '@/lib/crypto'
import { randomBytes } from 'crypto'
import type { User } from '@/types'

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
    .select(
      'id, github_username, telegram_chat_id, preferred_model, plan, tasks_used_this_month, tasks_limit, anthropic_api_key, openai_api_key, telegram_connect_token'
    )
    .eq('id', user.id)
    .single()

  if (!profile) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  let connectToken = profile.telegram_connect_token
  if (!connectToken) {
    connectToken = randomBytes(16).toString('hex')
    await serviceClient
      .from('users')
      .update({ telegram_connect_token: connectToken })
      .eq('id', user.id)
  }

  const safeProfile: Partial<User> = {
    id: profile.id,
    github_username: profile.github_username,
    telegram_chat_id: profile.telegram_chat_id,
    preferred_model: profile.preferred_model,
    plan: profile.plan,
    tasks_used_this_month: profile.tasks_used_this_month,
    tasks_limit: profile.tasks_limit,
    anthropic_api_key: profile.anthropic_api_key ? '••••••••' : null,
    openai_api_key: profile.openai_api_key ? '••••••••' : null,
  }

  return NextResponse.json({ user: safeProfile, connectToken })
}

export async function PATCH(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await request.json()) as {
    anthropic_api_key?: string
    openai_api_key?: string
    preferred_model?: string
  }

  const updates: Record<string, string> = {}

  if (body.anthropic_api_key) {
    updates.anthropic_api_key = encrypt(body.anthropic_api_key)
  }
  if (body.openai_api_key) {
    updates.openai_api_key = encrypt(body.openai_api_key)
  }
  if (body.preferred_model) {
    updates.preferred_model = body.preferred_model
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No updates provided' }, { status: 400 })
  }

  updates.updated_at = new Date().toISOString()

  const serviceClient = createServiceClient()
  const { error } = await serviceClient.from('users').update(updates).eq('id', user.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
