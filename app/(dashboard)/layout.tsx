import Link from 'next/link'
import Image from 'next/image'
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
    <div className="flex h-dvh flex-col overflow-hidden bg-[#0c0c0e] text-zinc-100">
      <header className="flex h-11 shrink-0 items-center justify-between border-b border-zinc-800 px-3">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="font-mono text-sm font-bold text-zinc-100">
            Bopple
          </Link>
          <Link href="/" className="text-xs text-zinc-500 hover:text-zinc-300">
            Home
          </Link>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-xs text-zinc-500 sm:inline">
            {profile?.tasks_used_this_month ?? 0} tasks
          </span>
          {profile?.github_avatar_url && (
            <Image
              src={profile.github_avatar_url}
              alt={profile.github_username}
              width={24}
              height={24}
              className="h-6 w-6 rounded-full border border-zinc-700"
            />
          )}
        </div>
      </header>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  )
}
