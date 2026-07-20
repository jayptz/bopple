'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import type { GitHubRepo } from '@/components/RepoSelector'

function sortByFullName(repos: GitHubRepo[]) {
  return [...repos].sort((a, b) =>
    a.full_name.localeCompare(b.full_name, undefined, { sensitivity: 'base' })
  )
}

export default function ReposPage() {
  const [githubRepos, setGithubRepos] = useState<GitHubRepo[]>([])
  const [githubUsername, setGithubUsername] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/github/repos')
        if (!res.ok) throw new Error('Failed to load repos')
        const data = (await res.json()) as {
          repos: GitHubRepo[]
          github_username: string
          saved_repo_ids: number[]
        }
        setGithubRepos(data.repos)
        setGithubUsername(data.github_username)
        setSelected(new Set(data.saved_repo_ids ?? []))
      } catch {
        setMessage('Could not load GitHub repos. Try signing in again.')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const { ownedRepos, collaboratingRepos } = useMemo(() => {
    const username = githubUsername?.toLowerCase() ?? ''
    const owned: GitHubRepo[] = []
    const collaborating: GitHubRepo[] = []

    for (const repo of githubRepos) {
      const ownerLogin = repo.owner?.login?.toLowerCase() ?? ''
      if (username && ownerLogin === username) {
        owned.push(repo)
      } else {
        collaborating.push(repo)
      }
    }

    return {
      ownedRepos: sortByFullName(owned),
      collaboratingRepos: sortByFullName(collaborating),
    }
  }, [githubRepos, githubUsername])

  function toggleRepo(id: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleSave() {
    setSaving(true)
    setMessage(null)

    try {
      const repos = githubRepos
        .filter((r) => selected.has(r.id))
        .map((r) => ({
          github_repo_id: r.id,
          name: r.name,
          full_name: r.full_name,
          default_branch: r.default_branch,
          is_private: r.private,
          is_active: true,
        }))

      const res = await fetch('/api/github/repos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repos }),
      })

      if (!res.ok) {
        const data = (await res.json()) as { error?: string }
        throw new Error(data.error ?? 'Failed to save')
      }

      setMessage(`Saved ${repos.length} repo${repos.length === 1 ? '' : 's'}`)
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  function renderRepoList(repos: GitHubRepo[]) {
    return (
      <div className="space-y-2">
        {repos.map((repo) => {
          const isSaved = selected.has(repo.id)
          return (
            <label
              key={repo.id}
              className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors ${
                isSaved
                  ? 'border-emerald-700 bg-emerald-950/30'
                  : 'border-zinc-800 bg-zinc-900 hover:border-zinc-700'
              }`}
            >
              <input
                type="checkbox"
                checked={isSaved}
                onChange={() => toggleRepo(repo.id)}
                className="rounded border-zinc-700 bg-zinc-800 text-emerald-600 focus:ring-emerald-600"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-mono text-zinc-200">{repo.full_name}</p>
                  {isSaved && (
                    <span className="shrink-0 rounded border border-emerald-800/80 bg-emerald-950/50 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-emerald-400">
                      Connected
                    </span>
                  )}
                </div>
                <p className="text-xs text-zinc-500">
                  {repo.private ? 'Private' : 'Public'} · {repo.default_branch}
                </p>
              </div>
            </label>
          )
        })}
      </div>
    )
  }

  return (
    <div className="mx-auto h-full max-w-2xl space-y-6 overflow-y-auto px-4 py-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">Repos</h1>
          <p className="text-sm text-zinc-500">
            Select which repos Bopple can work on. Connected repos stay checked.
          </p>
        </div>
        <Link href="/dashboard" className="text-xs text-zinc-500 hover:text-zinc-300">
          ← Back
        </Link>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg bg-zinc-900" />
          ))}
        </div>
      ) : (
        <div className="space-y-8">
          {ownedRepos.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-medium text-zinc-300">Your repos</h2>
              {renderRepoList(ownedRepos)}
            </section>
          )}

          {collaboratingRepos.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-medium text-zinc-300">Collaborating on</h2>
              {renderRepoList(collaboratingRepos)}
            </section>
          )}

          {ownedRepos.length === 0 && collaboratingRepos.length === 0 && (
            <p className="text-sm text-zinc-500">No GitHub repos found for this account.</p>
          )}
        </div>
      )}

      {message && <p className="text-sm text-zinc-400">{message}</p>}

      <Button onClick={handleSave} disabled={saving || loading}>
        {saving ? 'Saving...' : 'Save Repos'}
      </Button>
    </div>
  )
}
