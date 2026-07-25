'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

type DashboardUserMenuProps = {
  githubUsername: string | null
  githubAvatarUrl: string | null
  /** Open the menu upward (sidebar footer) instead of downward. */
  menuUp?: boolean
  /** Show @username next to the avatar. */
  showUsername?: boolean
}

export function DashboardUserMenu({
  githubUsername,
  githubAvatarUrl,
  menuUp = false,
  showUsername = false,
}: DashboardUserMenuProps) {
  const [open, setOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  useEffect(() => {
    if (!open) return

    function onPointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  async function handleSignOut() {
    setSigningOut(true)
    try {
      const supabase = createClient()
      await supabase.auth.signOut()
      router.push('/login')
      router.refresh()
    } catch {
      setSigningOut(false)
    }
  }

  return (
    <div className="relative min-w-0" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex max-w-full items-center gap-2 rounded-md px-1 py-1 outline-none ring-dash-accent hover:bg-dash-text/5 focus-visible:ring-2"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
      >
        {githubAvatarUrl ? (
          <Image
            src={githubAvatarUrl}
            alt={githubUsername ?? 'Account'}
            width={24}
            height={24}
            className="h-6 w-6 shrink-0 rounded-full border border-dash-border"
          />
        ) : (
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-dash-border bg-dash-text/10 text-[10px] text-dash-text">
            {(githubUsername ?? 'U').slice(0, 1).toUpperCase()}
          </span>
        )}
        {showUsername && githubUsername && (
          <span className="truncate text-xs text-dash-text">{githubUsername}</span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className={`absolute left-0 z-50 w-44 overflow-hidden rounded-lg border border-dash-border bg-dash-bg py-1 shadow-lg ${
            menuUp ? 'bottom-full mb-2' : 'top-full mt-2'
          }`}
        >
          {githubUsername && (
            <p className="truncate border-b border-dash-border px-3 py-2 text-xs text-dash-text/45">
              @{githubUsername}
            </p>
          )}
          <Link
            href="/dashboard/settings"
            role="menuitem"
            className="block px-3 py-2 text-xs text-dash-text hover:bg-dash-text/5"
            onClick={() => setOpen(false)}
          >
            Settings
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={handleSignOut}
            disabled={signingOut}
            className="block w-full px-3 py-2 text-left text-xs text-dash-text hover:bg-dash-text/5 disabled:opacity-50"
          >
            {signingOut ? 'Logging out…' : 'Log out'}
          </button>
        </div>
      )}
    </div>
  )
}
