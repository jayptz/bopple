import Link from 'next/link'
import { createClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login?next=/dashboard')

  const { data: profile } = await supabase
    .from('users')
    .select('github_username, github_avatar_url, tasks_used_this_month')
    .eq('id', user.id)
    .single()

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-dash-bg text-dash-text">
      <header className="flex h-11 shrink-0 items-center justify-between border-b border-dash-border px-3">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="font-mono text-sm font-bold text-dash-text">
            Bopple
          </Link>
          <Link href="/" className="text-xs text-dash-text/45 hover:text-dash-text/80">
            Home
          </Link>
        </div>
        <span className="text-xs text-dash-text/45">
          {profile?.tasks_used_this_month ?? 0} tasks
        </span>
      </header>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  )
}
