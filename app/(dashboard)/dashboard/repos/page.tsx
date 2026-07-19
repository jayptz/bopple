'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import type { GitHubRepo } from '@/components/RepoSelector'

export default function ReposPage() {
  const [githubRepos, setGithubRepos] = useState<GitHubRepo[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/github/repos')
        if (!res.ok) throw new Error('Failed to load repos')
        const data = (await res.json()) as { repos: GitHubRepo[] }
        setGithubRepos(data.repos)
      } catch {
        setMessage('Could not load GitHub repos. Try signing in again.')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-zinc-100">Repos</h1>
        <p className="text-sm text-zinc-500">
          Select which repos Bopple can work on. Tasks use your first active repo.
        </p>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg bg-zinc-900" />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {githubRepos.map((repo) => (
            <label
              key={repo.id}
              className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                selected.has(repo.id)
                  ? 'border-emerald-700 bg-emerald-950/30'
                  : 'border-zinc-800 bg-zinc-900 hover:border-zinc-700'
              }`}
            >
              <input
                type="checkbox"
                checked={selected.has(repo.id)}
                onChange={() => toggleRepo(repo.id)}
                className="rounded border-zinc-700 bg-zinc-800 text-emerald-600 focus:ring-emerald-600"
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-mono text-zinc-200 truncate">{repo.full_name}</p>
                <p className="text-xs text-zinc-500">
                  {repo.private ? 'Private' : 'Public'} · {repo.default_branch}
                </p>
              </div>
            </label>
          ))}
        </div>
      )}

      {message && <p className="text-sm text-zinc-400">{message}</p>}

      <Button onClick={handleSave} disabled={saving || loading}>
        {saving ? 'Saving...' : 'Save Repos'}
      </Button>
    </div>
  )
}
