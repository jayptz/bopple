'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import type { GitHubRepo } from '@/components/RepoSelector'
import { DEFAULT_MODEL, MODEL_OPTIONS } from '@/types'
import type { User } from '@/types'

function sortByFullName(repos: GitHubRepo[]) {
  return [...repos].sort((a, b) =>
    a.full_name.localeCompare(b.full_name, undefined, { sensitivity: 'base' })
  )
}

export default function SettingsPage() {
  const [profile, setProfile] = useState<Partial<User> | null>(null)
  const [anthropicKey, setAnthropicKey] = useState('')
  const [openaiKey, setOpenaiKey] = useState('')
  const [model, setModel] = useState<string>(DEFAULT_MODEL)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [connectToken, setConnectToken] = useState<string | null>(null)

  const [githubRepos, setGithubRepos] = useState<GitHubRepo[]>([])
  const [githubUsername, setGithubUsername] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [reposLoading, setReposLoading] = useState(true)
  const [reposSaving, setReposSaving] = useState(false)
  const [reposMessage, setReposMessage] = useState<string | null>(null)

  useEffect(() => {
    async function loadSettings() {
      const res = await fetch('/api/settings')
      if (res.ok) {
        const data = (await res.json()) as { user: User; connectToken: string }
        setProfile(data.user)
        setModel(data.user.preferred_model)
        setConnectToken(data.connectToken)
      }
    }
    async function loadRepos() {
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
        setReposMessage('Could not load GitHub repos. Try signing in again.')
      } finally {
        setReposLoading(false)
      }
    }
    void loadSettings()
    void loadRepos()
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

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setMessage(null)

    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          anthropic_api_key: anthropicKey || undefined,
          openai_api_key: openaiKey || undefined,
          preferred_model: model,
        }),
      })

      if (!res.ok) {
        const data = (await res.json()) as { error?: string }
        throw new Error(data.error ?? 'Failed to save')
      }

      setAnthropicKey('')
      setOpenaiKey('')
      setMessage('Settings saved')
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function handleUpgrade() {
    const res = await fetch('/api/billing/checkout', { method: 'POST' })
    if (res.ok) {
      const data = (await res.json()) as { url: string }
      window.location.href = data.url
    }
  }

  async function handleManageBilling() {
    const res = await fetch('/api/billing/portal', { method: 'POST' })
    if (res.ok) {
      const data = (await res.json()) as { url: string }
      window.location.href = data.url
    }
  }

  function copyToken() {
    if (connectToken) {
      navigator.clipboard.writeText(`/connect ${connectToken}`)
      setMessage('Copied! Paste in @BoppleBot on Telegram.')
    }
  }

  function toggleRepo(id: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleSaveRepos() {
    setReposSaving(true)
    setReposMessage(null)

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

      setReposMessage(`Saved ${repos.length} repo${repos.length === 1 ? '' : 's'}`)
    } catch (err) {
      setReposMessage(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setReposSaving(false)
    }
  }

  function renderRepoList(list: GitHubRepo[]) {
    return (
      <div className="space-y-2">
        {list.map((repo) => {
          const isSaved = selected.has(repo.id)
          return (
            <label
              key={repo.id}
              className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors ${
                isSaved
                  ? 'border-dash-accent bg-dash-bg'
                  : 'border-dash-border bg-dash-bg hover:border-dash-border'
              }`}
            >
              <input
                type="checkbox"
                checked={isSaved}
                onChange={() => toggleRepo(repo.id)}
                className="rounded border-dash-border bg-dash-bg text-dash-accent focus:ring-dash-accent"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-mono text-dash-text">{repo.full_name}</p>
                  {isSaved && (
                    <span className="shrink-0 text-[10px] uppercase tracking-wide text-dash-accent">
                      Connected
                    </span>
                  )}
                </div>
                <p className="text-xs text-dash-text/45">
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
    <div className="mx-auto h-full max-w-2xl space-y-10 overflow-y-auto bg-dash-bg px-4 py-6 text-dash-text">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-dash-text">Settings</h1>
          <p className="text-sm text-dash-text/45">Repos, Telegram, model, keys, billing</p>
        </div>
        <Link href="/dashboard" className="text-xs text-dash-text/45 hover:text-dash-text">
          ← Back
        </Link>
      </div>

      {/* Repositories */}
      <section id="repos" className="space-y-4">
        <div>
          <h2 className="text-sm font-medium text-dash-text">Repositories</h2>
          <p className="mt-0.5 text-xs text-dash-text/45">
            Select which repos Bopple can work on. Connected repos stay checked.
          </p>
        </div>

        {reposLoading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-14 animate-pulse rounded-lg bg-dash-text/5" />
            ))}
          </div>
        ) : (
          <div className="space-y-6">
            {ownedRepos.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-xs font-medium uppercase tracking-wide text-dash-text/40">
                  Your repos
                </h3>
                {renderRepoList(ownedRepos)}
              </div>
            )}

            {collaboratingRepos.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-xs font-medium uppercase tracking-wide text-dash-text/40">
                  Collaborating on
                </h3>
                {renderRepoList(collaboratingRepos)}
              </div>
            )}

            {ownedRepos.length === 0 && collaboratingRepos.length === 0 && (
              <p className="text-sm text-dash-text/45">No GitHub repos found for this account.</p>
            )}
          </div>
        )}

        {reposMessage && <p className="text-sm text-dash-text/60">{reposMessage}</p>}

        <Button onClick={handleSaveRepos} disabled={reposSaving || reposLoading}>
          {reposSaving ? 'Saving...' : 'Save Repos'}
        </Button>
      </section>

      <div className="border-t border-dash-border" />

      {/* Telegram */}
      <section className="space-y-3 rounded-xl border border-dash-border p-4">
        <h2 className="text-sm font-medium text-dash-text">Telegram</h2>
        <p className="text-xs text-dash-text/45">
          Message @BoppleBot with this command to link your account:
        </p>
        {connectToken ? (
          <div className="flex gap-2">
            <code className="flex-1 truncate rounded-lg border border-dash-border bg-dash-bg px-3 py-2 font-mono text-xs text-dash-accent">
              /connect {connectToken}
            </code>
            <Button variant="secondary" size="sm" onClick={copyToken}>
              Copy
            </Button>
          </div>
        ) : (
          <p className="text-xs text-dash-text/40">Loading...</p>
        )}
        {profile?.telegram_chat_id && (
          <p className="text-xs text-dash-accent">Telegram connected</p>
        )}
      </section>

      <form onSubmit={handleSave} className="space-y-4">
        <section className="space-y-4 rounded-xl border border-dash-border p-4">
          <h2 className="text-sm font-medium text-dash-text">Model</h2>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="w-full rounded-lg border border-dash-border bg-dash-bg px-3 py-2 text-sm text-dash-text focus:border-dash-accent focus:outline-none"
          >
            {MODEL_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
            {!MODEL_OPTIONS.some((opt) => opt.value === model) && model && (
              <option value={model}>{model} (saved)</option>
            )}
          </select>
        </section>

        <section className="space-y-4 rounded-xl border border-dash-border p-4">
          <h2 className="text-sm font-medium text-dash-text">API Keys (BYOK)</h2>
          <p className="text-xs text-dash-text/45">
            Keys are encrypted before storage. Leave blank to keep existing.
            {profile?.anthropic_api_key
              ? ' Anthropic key is currently saved.'
              : ' No Anthropic key saved — platform key will be used if configured.'}
          </p>
          <Input
            label="Anthropic API Key"
            type="password"
            placeholder="sk-ant-..."
            value={anthropicKey}
            onChange={(e) => setAnthropicKey(e.target.value)}
          />
          <Input
            label="OpenAI API Key"
            type="password"
            placeholder="sk-..."
            value={openaiKey}
            onChange={(e) => setOpenaiKey(e.target.value)}
          />
          {profile?.anthropic_api_key && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={async () => {
                setSaving(true)
                setMessage(null)
                try {
                  const res = await fetch('/api/settings', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ clear_anthropic_api_key: true }),
                  })
                  if (!res.ok) {
                    const data = (await res.json()) as { error?: string }
                    throw new Error(data.error ?? 'Failed to clear key')
                  }
                  setProfile((p) => (p ? { ...p, anthropic_api_key: null } : p))
                  setMessage('Anthropic key cleared — will use platform ANTHROPIC_API_KEY')
                } catch (err) {
                  setMessage(err instanceof Error ? err.message : 'Failed to clear key')
                } finally {
                  setSaving(false)
                }
              }}
            >
              Clear saved Anthropic key
            </Button>
          )}
        </section>

        {message && <p className="text-sm text-dash-text/60">{message}</p>}

        <Button type="submit" disabled={saving}>
          {saving ? 'Saving...' : 'Save Settings'}
        </Button>
      </form>

      <section className="space-y-3 rounded-xl border border-dash-border p-4">
        <div>
          <h2 className="text-sm font-medium text-dash-text">Billing</h2>
          <p className="mt-0.5 text-xs text-dash-text/45">
            Plan: <span className="capitalize text-dash-text">{profile?.plan ?? 'free'}</span>
            {' · '}
            {profile?.tasks_used_this_month ?? 0} tasks this month (unlimited)
          </p>
        </div>
        {profile?.plan === 'pro' ? (
          <Button variant="secondary" size="sm" onClick={handleManageBilling}>
            Manage Subscription
          </Button>
        ) : (
          <Button variant="secondary" size="sm" onClick={handleUpgrade}>
            Upgrade to Pro — $15/mo
          </Button>
        )}
      </section>
    </div>
  )
}
