'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { DiffViewer } from '@/components/DiffViewer'
import { DashboardUserMenu } from '@/components/DashboardUserMenu'
import { absolutePreviewUrl } from '@/lib/preview-url'
import type { Task, Repo, FeedbackEntry, AgentLogEntry } from '@/types'

function timeAgo(date: string) {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function shortRepoLabel(fullName: string) {
  const parts = fullName.split('/')
  return parts[parts.length - 1] ?? fullName
}

/** Parse changed file paths from a unified diff. */
export function parseChangedFiles(diff: string | null | undefined): string[] {
  if (!diff) return []
  const files: string[] = []
  const seen = new Set<string>()
  for (const line of diff.split('\n')) {
    const git = line.match(/^diff --git a\/(.+) b\/(.+)$/)
    if (git) {
      const path = git[2]
      if (!seen.has(path)) {
        seen.add(path)
        files.push(path)
      }
      continue
    }
    const plus = line.match(/^\+\+\+ b\/(.+)$/)
    if (plus && plus[1] !== '/dev/null' && !seen.has(plus[1])) {
      seen.add(plus[1])
      files.push(plus[1])
    }
  }
  return files
}

function isNarrationLog(log: AgentLogEntry): boolean {
  return log.type === 'thinking' || log.type === 'done'
}

function mergeTask(prev: Task, next: Partial<Task> & { id: string }): Task {
  return { ...prev, ...next }
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  )
}

function SettingsGearIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

export function DashboardWorkspace() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [repos, setRepos] = useState<Repo[]>([])
  const [profile, setProfile] = useState<{
    github_username: string | null
    github_avatar_url: string | null
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  /** Accordion: only one repo expanded; null = all collapsed (default). */
  const [expandedRepo, setExpandedRepo] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [showNewTask, setShowNewTask] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [selectedRepoId, setSelectedRepoId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState('')
  const [sending, setSending] = useState(false)
  const [resolving, setResolving] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mobilePane, setMobilePane] = useState<'sidebar' | 'chat' | 'code'>('chat')
  const [fetchedDiff, setFetchedDiff] = useState<string | null>(null)

  const chatEndRef = useRef<HTMLDivElement>(null)
  const supabase = useMemo(() => createClient(), [])

  function upsertTask(updated: Task) {
    setTasks((prev) => {
      const exists = prev.find((t) => t.id === updated.id)
      if (exists) {
        return prev.map((t) => (t.id === updated.id ? mergeTask(t, updated) : t))
      }
      return [updated, ...prev]
    })
  }

  async function refreshTasks() {
    try {
      const res = await fetch('/api/tasks')
      if (!res.ok) return
      const data = (await res.json()) as { tasks: Task[] }
      setTasks(data.tasks)
      setSelectedTaskId((current) => current ?? data.tasks[0]?.id ?? null)
    } catch {
      // Keep existing state on transient fetch failures.
    }
  }

  useEffect(() => {
    async function load() {
      const [tasksRes, reposRes, profileRes] = await Promise.all([
        fetch('/api/tasks'),
        supabase.from('repos').select('*').eq('is_active', true),
        supabase.from('users').select('github_username, github_avatar_url').single(),
      ])

      if (tasksRes.ok) {
        const data = (await tasksRes.json()) as { tasks: Task[] }
        setTasks(data.tasks)
        if (data.tasks[0]) setSelectedTaskId(data.tasks[0].id)
      }

      if (reposRes.data) {
        setRepos(reposRes.data as Repo[])
        if (reposRes.data[0]) setSelectedRepoId(reposRes.data[0].id)
      }

      if (profileRes.data) {
        setProfile({
          github_username: profileRes.data.github_username ?? null,
          github_avatar_url: profileRes.data.github_avatar_url ?? null,
        })
      }

      setLoading(false)
    }

    void load()

    const channel = supabase
      .channel('tasks-workspace')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tasks' },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const oldRow = payload.old as { id?: string }
            if (oldRow.id) {
              setTasks((prev) => prev.filter((t) => t.id !== oldRow.id))
            }
            return
          }
          const updated = payload.new as Task
          if (!updated?.id) return
          upsertTask(updated)
        }
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [supabase])

  const hasActiveTask = tasks.some((t) => t.status === 'queued' || t.status === 'running')

  useEffect(() => {
    if (!hasActiveTask) return
    const id = window.setInterval(() => {
      void refreshTasks()
    }, 2000)
    return () => window.clearInterval(id)
  }, [hasActiveTask])

  const selectedTask = useMemo(
    () => tasks.find((t) => t.id === selectedTaskId) ?? null,
    [tasks, selectedTaskId]
  )

  const selectedDiffText = selectedTask?.diff_text
  const selectedPrNumber = selectedTask?.pr_number

  useEffect(() => {
    setFetchedDiff(null)
    if (!selectedTaskId || selectedDiffText || !selectedPrNumber) return

    let cancelled = false
    async function loadDiff() {
      try {
        const res = await fetch(`/api/tasks/${selectedTaskId}/diff`)
        if (!res.ok) return
        const data = (await res.json()) as { diff?: string | null }
        if (!cancelled && data.diff) {
          setFetchedDiff(data.diff)
          setTasks((prev) =>
            prev.map((t) =>
              t.id === selectedTaskId ? { ...t, diff_text: data.diff ?? null } : t
            )
          )
        }
      } catch {
        // Ignore — panel will show placeholder.
      }
    }
    void loadDiff()
    return () => {
      cancelled = true
    }
  }, [selectedTaskId, selectedDiffText, selectedPrNumber])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [selectedTask?.agent_logs?.length, selectedTask?.feedback_history?.length, selectedTask?.status])

  /** Only repos that already have conversations (tasks). */
  const sidebarRepos = useMemo(() => {
    const byName = new Map<string, { fullName: string; repoId: string | null; tasks: Task[] }>()

    for (const task of tasks) {
      const key = task.repo_full_name ?? 'Unknown repo'
      const existing = byName.get(key) ?? { fullName: key, repoId: task.repo_id, tasks: [] }
      existing.tasks.push(task)
      byName.set(key, existing)
    }

    const order = repos.map((r) => r.full_name)
    return Array.from(byName.values())
      .filter((g) => g.tasks.length > 0)
      .sort((a, b) => {
        const ai = order.indexOf(a.fullName)
        const bi = order.indexOf(b.fullName)
        if (ai === -1 && bi === -1) return a.fullName.localeCompare(b.fullName)
        if (ai === -1) return 1
        if (bi === -1) return -1
        return ai - bi
      })
  }, [repos, tasks])

  const filteredSidebarRepos = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return sidebarRepos
    return sidebarRepos
      .map((group) => {
        const repoHit =
          group.fullName.toLowerCase().includes(q) ||
          shortRepoLabel(group.fullName).toLowerCase().includes(q)

        const matchedTasks = group.tasks.filter((t) => {
          const haystack = [
            t.prompt,
            t.pr_title,
            t.branch_name,
            t.repo_full_name,
            t.status,
            ...(t.feedback_history ?? []).map((f) => f.message),
          ]
            .filter(Boolean)
            .join('\n')
            .toLowerCase()
          return haystack.includes(q)
        })

        // Repo name match → keep all its tasks visible; otherwise only matching tasks.
        if (repoHit) return group
        if (matchedTasks.length === 0) return null
        return { ...group, tasks: matchedTasks }
      })
      .filter((g): g is NonNullable<typeof g> => g != null)
  }, [sidebarRepos, searchQuery])

  function updateTask(updated: Task) {
    upsertTask(updated)
  }

  async function createTask() {
    if (!prompt.trim() || !selectedRepoId) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim(), repo_id: selectedRepoId }),
      })
      const data = (await res.json()) as { task?: Task; error?: string }
      if (!res.ok || !data.task) throw new Error(data.error ?? 'Failed to create task')
      setTasks((prev) => [data.task!, ...prev])
      setSelectedTaskId(data.task.id)
      setPrompt('')
      setShowNewTask(false)
      setMobilePane('chat')
      const fullName = data.task.repo_full_name
      if (fullName) setExpandedRepo(fullName)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create task')
    } finally {
      setSubmitting(false)
    }
  }

  async function submitFeedback() {
    if (!selectedTask || !feedback.trim()) return
    setSending(true)
    setError(null)
    try {
      const res = await fetch(`/api/tasks/${selectedTask.id}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedback: feedback.trim() }),
      })
      const data = (await res.json()) as { task?: Task; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Failed to send feedback')
      if (data.task) updateTask(data.task)
      setFeedback('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send feedback')
    } finally {
      setSending(false)
    }
  }

  async function resolveTask() {
    if (!selectedTask) return
    setResolving(true)
    setError(null)
    try {
      const res = await fetch(`/api/tasks/${selectedTask.id}/resolve`, { method: 'POST' })
      const data = (await res.json()) as { task?: Task; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Failed to resolve')
      if (data.task) updateTask(data.task)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resolve')
    } finally {
      setResolving(false)
    }
  }

  async function stopTask() {
    if (!selectedTask) return
    setStopping(true)
    setError(null)
    try {
      const res = await fetch(`/api/tasks/${selectedTask.id}/stop`, { method: 'POST' })
      const data = (await res.json()) as { task?: Task; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Failed to stop')
      if (data.task) updateTask(data.task)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to stop')
    } finally {
      setStopping(false)
    }
  }

  const canFeedback =
    selectedTask?.status === 'awaiting_feedback' ||
    (selectedTask?.status === 'running' && Boolean(selectedTask.pr_url))

  const canStop = selectedTask?.status === 'running'

  const showResolve =
    selectedTask != null &&
    (selectedTask.status === 'awaiting_feedback' ||
      selectedTask.status === 'failed' ||
      (Boolean(selectedTask.pr_url) &&
        selectedTask.status !== 'done' &&
        selectedTask.status !== 'queued'))

  const diffBody = selectedTask?.diff_text ?? fetchedDiff
  const changedFiles = useMemo(() => parseChangedFiles(diffBody), [diffBody])

  const previewHref = selectedTask?.demo_url
    ? absolutePreviewUrl(selectedTask.demo_url)
    : null

  const statusHint =
    selectedTask?.status === 'queued'
      ? 'Queued'
      : selectedTask?.status === 'running'
        ? 'Working…'
        : selectedTask?.status === 'awaiting_feedback'
          ? 'Waiting for your reply'
          : selectedTask?.status === 'failed'
            ? 'Failed'
            : selectedTask?.status === 'done'
              ? 'Resolved'
              : null

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-dash-text/45">
        Loading workspace...
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-dash-bg text-dash-text">
      <div className="flex border-b border-dash-border lg:hidden">
        {(
          [
            ['sidebar', 'Repos'],
            ['chat', 'Chat'],
            ['code', 'Code'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setMobilePane(id)}
            className={`flex-1 px-3 py-2 text-xs font-medium ${
              mobilePane === id
                ? 'border-b-2 border-dash-accent text-dash-text'
                : 'text-dash-text/45'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex min-h-0 flex-1">
        {/* LEFT sidebar */}
        <aside
          className={`w-full shrink-0 flex-col border-r border-dash-border bg-dash-bg lg:flex lg:w-64 xl:w-72 ${
            mobilePane === 'sidebar' ? 'flex' : 'hidden'
          }`}
        >
          <div className="space-y-0.5 border-b border-dash-border px-2 py-2">
            <button
              type="button"
              onClick={() => setShowNewTask(true)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-dash-text hover:bg-dash-text/5"
            >
              <span className="text-dash-accent">+</span>
              New Task
            </button>
            <label className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-dash-text">
              <SearchIcon className="shrink-0 text-dash-accent" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search conversations or repos"
                className="min-w-0 flex-1 bg-transparent text-xs text-dash-text placeholder:text-dash-text/35 focus:outline-none"
              />
            </label>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            <p className="px-2 pb-2 pt-1 text-[10px] font-medium uppercase tracking-wide text-dash-text/40">
              Repositories
            </p>
            {filteredSidebarRepos.length === 0 ? (
              <p className="px-2 py-4 text-xs text-dash-text/40">No conversations yet.</p>
            ) : (
              <div className="space-y-0.5">
                {filteredSidebarRepos.map((group) => {
                  const searching = searchQuery.trim().length > 0
                  const open = searching || expandedRepo === group.fullName
                  return (
                    <div key={group.fullName}>
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedRepo((prev) =>
                            prev === group.fullName ? null : group.fullName
                          )
                        }
                        className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs text-dash-text/80 hover:bg-dash-text/5"
                      >
                        <span className="w-3 shrink-0 text-dash-text/35">
                          {open ? '▾' : '▸'}
                        </span>
                        <span className="truncate font-mono">
                          {shortRepoLabel(group.fullName)}
                        </span>
                      </button>
                      {open && (
                        <div className="mb-1 ml-3 space-y-0.5 border-l border-dash-border pl-2">
                          {group.tasks.map((task) => (
                              <button
                                key={task.id}
                                type="button"
                                onClick={() => {
                                  setSelectedTaskId(task.id)
                                  setMobilePane('chat')
                                }}
                                className={`w-full rounded-md px-2 py-1.5 text-left transition-colors ${
                                  selectedTaskId === task.id
                                    ? 'bg-dash-text/10 text-dash-text'
                                    : 'text-dash-text/60 hover:bg-dash-text/5 hover:text-dash-text'
                                }`}
                              >
                                <p className="truncate text-xs">{task.prompt}</p>
                                <p className="mt-0.5 text-[10px] text-dash-text/35">
                                  {timeAgo(task.created_at)}
                                </p>
                              </button>
                            ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="flex items-center gap-1.5 border-t border-dash-border p-2">
            <DashboardUserMenu
              githubUsername={profile?.github_username ?? null}
              githubAvatarUrl={profile?.github_avatar_url ?? null}
              menuUp
              showUsername
            />
            <Link
              href="/dashboard/settings"
              className="rounded-md p-1.5 text-dash-text/55 hover:bg-dash-text/5 hover:text-dash-text"
              aria-label="Settings"
            >
              <SettingsGearIcon className="h-3.5 w-3.5" />
            </Link>
          </div>
        </aside>

        {/* CENTER: chat */}
        <section
          className={`min-w-0 flex-1 flex-col bg-dash-bg lg:flex ${
            mobilePane === 'chat' ? 'flex' : 'hidden'
          }`}
        >
          {selectedTask ? (
            <>
              <header className="flex items-center justify-between gap-3 border-b border-dash-border px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-dash-text">
                    {selectedTask.prompt}
                  </p>
                  <p className="truncate text-xs font-mono text-dash-text/45">
                    {selectedTask.repo_full_name}
                    {statusHint ? ` · ${statusHint}` : ''}
                  </p>
                </div>
              </header>

              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
                <div className="ml-auto max-w-[min(85%,28rem)] rounded-2xl border border-dash-border bg-dash-text/5 px-4 py-3 text-sm text-dash-text">
                  {selectedTask.prompt}
                  {selectedTask.reference_image_base64 && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`data:image/jpeg;base64,${selectedTask.reference_image_base64}`}
                      alt="Reference image"
                      className="mt-2 h-28 w-auto max-w-full rounded-lg border border-dash-border object-cover"
                    />
                  )}
                  <p className="mt-1 text-[10px] text-dash-text/40">
                    {timeAgo(selectedTask.created_at)}
                    {selectedTask.source === 'telegram' ? ' · Telegram' : ''}
                  </p>
                </div>

                {(selectedTask.agent_logs ?? []).map((log, i) => {
                  const narration = isNarrationLog(log)
                  return (
                    <div
                      key={`${log.timestamp}-${i}`}
                      className={
                        narration
                          ? 'max-w-[min(90%,32rem)] rounded-2xl border border-dash-border bg-dash-bg px-4 py-2.5 text-sm leading-relaxed text-dash-text'
                          : 'max-w-[min(90%,32rem)] rounded-xl border border-dash-border bg-dash-bg px-3 py-2 text-xs font-mono leading-relaxed text-dash-text/70'
                      }
                    >
                      {log.message}
                    </div>
                  )
                })}

                {(selectedTask.feedback_history ?? []).map((entry: FeedbackEntry, i) => (
                  <div
                    key={`${entry.timestamp}-${i}`}
                    className="ml-auto max-w-[min(85%,28rem)] rounded-2xl border border-dash-border bg-dash-text/5 px-4 py-3 text-sm text-dash-text"
                  >
                    {entry.message}
                    <p className="mt-1 text-[10px] text-dash-text/40">
                      {timeAgo(entry.timestamp)}
                    </p>
                  </div>
                ))}

                {selectedTask.status === 'failed' && selectedTask.error_message && (
                  <div className="max-w-[min(90%,32rem)] rounded-2xl border border-dash-border bg-dash-text/5 px-4 py-2.5 text-sm text-dash-text/80">
                    {selectedTask.error_message}
                  </div>
                )}

                {(selectedTask.status === 'queued' || selectedTask.status === 'running') && (
                  <p className="text-xs text-dash-text/40 animate-pulse">Working…</p>
                )}
                <div ref={chatEndRef} />
              </div>

              <div className="space-y-2 border-t border-dash-border p-3">
                {error && <p className="text-xs text-dash-text/70">{error}</p>}
                <div className="flex flex-wrap gap-2">
                  {selectedTask.pr_url && (
                    <a
                      href={selectedTask.pr_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg border border-dash-border px-3 py-1.5 text-xs text-dash-accent hover:bg-dash-text/5"
                    >
                      Open PR →
                    </a>
                  )}
                  {canStop && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={stopTask}
                      disabled={stopping || Boolean(selectedTask.interrupt_requested_at)}
                    >
                      {stopping || selectedTask.interrupt_requested_at ? 'Stopping...' : 'Stop'}
                    </Button>
                  )}
                  {showResolve && (
                    <Button size="sm" variant="secondary" onClick={resolveTask} disabled={resolving}>
                      {resolving ? 'Resolving...' : 'Mark resolved'}
                    </Button>
                  )}
                </div>
                {canFeedback && (
                  <div className="flex gap-2">
                    <textarea
                      value={feedback}
                      onChange={(e) => setFeedback(e.target.value)}
                      rows={2}
                      placeholder="Send feedback to continue..."
                      className="min-w-0 flex-1 resize-none rounded-xl border border-dash-border bg-dash-bg px-3 py-2 text-sm text-dash-text placeholder:text-dash-text/35 focus:border-dash-accent focus:outline-none"
                    />
                    <Button
                      size="sm"
                      className="self-end"
                      onClick={submitFeedback}
                      disabled={sending || !feedback.trim()}
                    >
                      {sending ? '...' : 'Send'}
                    </Button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
              <p className="text-sm text-dash-text/50">Select a task or create a new one</p>
              <button
                type="button"
                onClick={() => setShowNewTask(true)}
                className="rounded-md border border-dash-border px-3 py-1.5 text-sm text-dash-text hover:bg-dash-text/5"
              >
                + New Task
              </button>
            </div>
          )}
        </section>

        {/* RIGHT: code / diff */}
        <aside
          className={`w-full shrink-0 flex-col border-l border-dash-border bg-dash-bg lg:flex lg:w-[380px] xl:w-[420px] ${
            mobilePane === 'code' ? 'flex' : 'hidden'
          }`}
        >
          <header className="border-b border-dash-border px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-dash-text/40">Code</p>
            <p className="mt-0.5 truncate text-sm text-dash-text">
              {selectedTask?.pr_title ?? selectedTask?.branch_name ?? 'No file selected'}
            </p>
          </header>
          <div className="min-h-0 flex-1 space-y-3 overflow-auto p-3">
            {previewHref && (
              <a
                href={previewHref}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-xs text-dash-accent hover:underline"
              >
                Live preview →
              </a>
            )}
            {selectedTask?.screenshot_url && (
              <a
                href={selectedTask.screenshot_url}
                target="_blank"
                rel="noopener noreferrer"
                className="block"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={selectedTask.screenshot_url}
                  alt="Screenshot of the change"
                  className="w-full rounded-lg border border-dash-border"
                />
              </a>
            )}
            {selectedTask &&
              (selectedTask.files_changed != null || changedFiles.length > 0) && (
                <div className="rounded-lg border border-dash-border bg-dash-bg px-3 py-2 text-[11px] text-dash-text/60">
                  {selectedTask.branch_name && (
                    <p className="font-mono text-dash-text/40">branch: {selectedTask.branch_name}</p>
                  )}
                  {selectedTask.files_changed != null && (
                    <p className="mt-1">
                      {selectedTask.files_changed} file
                      {selectedTask.files_changed === 1 ? '' : 's'} changed
                      {selectedTask.lines_added != null || selectedTask.lines_removed != null
                        ? `  +${selectedTask.lines_added ?? 0} −${selectedTask.lines_removed ?? 0}`
                        : ''}
                    </p>
                  )}
                  {changedFiles.length > 0 && (
                    <ul className="mt-2 space-y-0.5 font-mono text-dash-text/70">
                      {changedFiles.map((path) => (
                        <li key={path} className="truncate">
                          {path}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            <DiffViewer
              diff={diffBody ?? undefined}
              placeholder={
                selectedTask?.status === 'queued' || selectedTask?.status === 'running'
                  ? 'Diff will appear here as the agent edits files...'
                  : 'No code changes yet. Open the PR for the full GitHub diff.'
              }
            />
          </div>
        </aside>
      </div>

      {showNewTask && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-dash-bg/80 p-4 sm:items-center">
          <div className="w-full max-w-md space-y-4 rounded-xl border border-dash-border bg-dash-bg p-5">
            <h2 className="text-lg font-semibold text-dash-text">New Task</h2>
            <div className="space-y-1.5">
              <label className="text-xs font-medium uppercase tracking-wide text-dash-text/45">
                Repository
              </label>
              <select
                value={selectedRepoId ?? ''}
                onChange={(e) => setSelectedRepoId(e.target.value)}
                className="w-full rounded-lg border border-dash-border bg-dash-bg px-3 py-2 text-sm text-dash-text"
              >
                {repos.map((repo) => (
                  <option key={repo.id} value={repo.id}>
                    {repo.full_name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium uppercase tracking-wide text-dash-text/45">
                Prompt
              </label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={4}
                placeholder="add a comment to the readme..."
                className="w-full resize-none rounded-lg border border-dash-border bg-dash-bg px-3 py-2 text-sm text-dash-text placeholder:text-dash-text/35"
              />
            </div>
            {error && <p className="text-xs text-dash-text/70">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowNewTask(false)}>
                Cancel
              </Button>
              <Button
                onClick={createTask}
                disabled={submitting || !prompt.trim() || !selectedRepoId}
              >
                {submitting ? 'Queuing...' : 'Queue Task'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
