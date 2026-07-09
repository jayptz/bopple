import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'

const navItems = [
  { href: '/', label: 'Tasks' },
  { href: '/repos', label: 'Repos' },
  { href: '/settings', label: 'Settings' },
]

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('github_username, github_avatar_url, tasks_used_this_month, tasks_limit')
    .eq('id', user.id)
    .single()

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="sticky top-0 z-10 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <Link href="/" className="font-mono font-bold text-lg text-zinc-100">
            Bopple
          </Link>
          <div className="flex items-center gap-4">
            <span className="text-xs text-zinc-500 hidden sm:block">
              {profile?.tasks_used_this_month ?? 0}/{profile?.tasks_limit ?? 10} tasks
            </span>
            {profile?.github_avatar_url && (
              <Image
                src={profile.github_avatar_url}
                alt={profile.github_username}
                width={28}
                height={28}
                className="h-7 w-7 rounded-full border border-zinc-700"
              />
            )}
          </div>
        </div>
        <nav className="mx-auto flex max-w-2xl gap-1 px-4 pb-2">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-lg px-3 py-1.5 text-sm text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100 transition-colors"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-6">{children}</main>
    </div>
  )
}
