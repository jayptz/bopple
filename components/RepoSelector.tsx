'use client'

import type { Repo } from '@/types'

interface RepoSelectorProps {
  savedRepos: Repo[]
  selectedRepoId: string | null
  onSelect: (repoId: string) => void
}

export function RepoSelector({
  savedRepos,
  selectedRepoId,
  onSelect,
}: RepoSelectorProps) {
  const activeRepos = savedRepos.filter((r) => r.is_active)

  if (activeRepos.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        No active repos.{' '}
        <a href="/repos" className="text-emerald-400 hover:underline">
          Connect one first →
        </a>
      </p>
    )
  }

  return (
    <div className="space-y-2">
      <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wide">
        Repository
      </label>
      <select
        value={selectedRepoId ?? activeRepos[0]?.id ?? ''}
        onChange={(e) => onSelect(e.target.value)}
        className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-emerald-600 focus:outline-none"
      >
        {activeRepos.map((repo) => (
          <option key={repo.id} value={repo.id}>
            {repo.full_name}
          </option>
        ))}
      </select>
    </div>
  )
}

export interface GitHubRepo {
  id: number
  name: string
  full_name: string
  default_branch: string
  private: boolean
}
