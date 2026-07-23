'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { DiffViewer } from '@/components/DiffViewer'
import { AGENT_LOG_ICONS, type Task, type Repo, type FeedbackEntry } from '@/types'

function timeAgo(date: string) {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function groupTasksByRepo(tasks: Task[], repos: Repo[]) {
  const repoOrder = repos.map((r) => r.full_name)
  const groups = new Map<string, { repoId: string | null; tasks: Task[] }>()

  for (const task of tasks) {
    const key = task.repo_full_name ?? 'Unknown repo'
    const existing = groups.get(key) ?? { repoId: task.repo_id, tasks: [] }
    existing.tasks.push(task)
    groups.set(key, existing)
  }

  return Array.from(groups.entries()).sort(([a], [b]) => {
    const ai = repoOrder.indexOf(a)
    const bi = repoOrder.indexOf(b)
    if (ai === -1 && bi === -1) return a.localeCompare(b)
    if (ai === -1) return 1
    if (bi === -1) return -1
    return ai - bi
  })
}

function mergeTask(prev: Task, next: Partial<Task> & { id: string }): Task {
  return { ...prev, ...next }
}

export function DashboardWorkspace() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [repos, setRepos] = useState<Repo[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [collapsedRepos, setCollapsedRepos] = useState<Record<string, boolean>>({})
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
      const [tasksRes, reposRes] = await Promise.all([
        fetch('/api/tasks'),
        supabase.from('repos').select('*').eq('is_active', true),
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

  // Poll while any task is active so logs/diff update without a manual refresh.
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

  // Backfill diff from GitHub for older tasks that predate diff_text.
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

  // Auto-scroll chat as agent logs arrive.
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [selectedTask?.agent_logs?.length, selectedTask?.feedback_history?.length, selectedTask?.status])

  const grouped = useMemo(() => groupTasksByRepo(tasks, repos), [tasks, repos])

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
  const codeMeta = selectedTask
    ? [
        selectedTask.pr_title ? `# ${selectedTask.pr_title}` : null,
        selectedTask.branch_name ? `branch: ${selectedTask.branch_name}` : null,
        selectedTask.files_changed != null
          ? [
              `files changed: ${selectedTask.files_changed}`,
              selectedTask.lines_added != null || selectedTask.lines_removed != null
                ? `+${selectedTask.lines_added ?? 0} -${selectedTask.lines_removed ?? 0}`
                : null,
            ]
              .filter(Boolean)
              .join(' ')
          : null,
      ]
        .filter((line): line is string => Boolean(line))
        .join('\n')
    : ''

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-zinc-500">
        Loading workspace...
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#0c0c0e] text-zinc-100">
      {/* Mobile pane switcher */}
      <div className="flex border-b border-zinc-800 lg:hidden">
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
                ? 'border-b-2 border-emerald-500 text-zinc-100'
                : 'text-zinc-500'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex min-h-0 flex-1">
        {/* LEFT: repos + tasks */}
        <aside
          className={`w-full shrink-0 flex-col border-r border-zinc-800 bg-[#0a0a0c] lg:flex lg:w-64 xl:w-72 ${
            mobilePane === 'sidebar' ? 'flex' : 'hidden'
          }`}
        >
          <div className="border-b border-zinc-800 p-3 space-y-2">
            <Button size="sm" className="w-full" onClick={() => setShowNewTask(true)}>
              + New Task
            </Button>
            <div className="flex gap-1 text-xs">
              <Link
                href="/dashboard/repos"
                className="rounded-md px-2 py-1 text-zinc-500 hover:bg-zinc-900 hover:text-zinc-200"
              >
                Repos
              </Link>
              <Link
                href="/dashboard/settings"
                className="rounded-md px-2 py-1 text-zinc-500 hover:bg-zinc-900 hover:text-zinc-200"
              >
                Settings
              </Link>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-2 space-y-3">
            {grouped.length === 0 ? (
              <p className="px-2 py-4 text-xs text-zinc-600">No tasks yet.</p>
            ) : (
              grouped.map(([repoName, group]) => {
                const collapsed = collapsedRepos[repoName]
                return (
                  <div key={repoName}>
                    <button
                      type="button"
                      onClick={() =>
                        setCollapsedRepos((prev) => ({
                          ...prev,
                          [repoName]: !prev[repoName],
                        }))
                      }
                      className="flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-left text-xs font-mono text-zinc-400 hover:bg-zinc-900"
                    >
                      <span className="text-zinc-600">{collapsed ? '▸' : '▾'}</span>
                      <span className="truncate">{repoName}</span>
                      <span className="ml-auto text-[10px] text-zinc-600">
                        {group.tasks.length}
                      </span>
                    </button>
                    {!collapsed && (
                      <div className="mt-0.5 space-y-0.5 pl-2">
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
                                ? 'bg-zinc-800 text-zinc-100'
                                : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'
                            }`}
                          >
                            <p className="truncate text-xs">{task.prompt}</p>
                            <div className="mt-1 flex items-center gap-2">
                              <Badge status={task.status} />
                              <span className="text-[10px] text-zinc-600">
                                {timeAgo(task.created_at)}
                              </span>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </aside>

        {/* CENTER: chat */}
        <section
          className={`min-w-0 flex-1 flex-col bg-[#0c0c0e] lg:flex ${
            mobilePane === 'chat' ? 'flex' : 'hidden'
          }`}
        >
          {selectedTask ? (
            <>
              <header className="flex items-center justify-between gap-3 border-b border-zinc-800 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-zinc-100">
                    {selectedTask.prompt}
                  </p>
                  <p className="truncate text-xs font-mono text-zinc-500">
                    {selectedTask.repo_full_name}
                  </p>
                </div>
                <Badge status={selectedTask.status} />
              </header>

              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
                <div className="ml-auto max-w-[85%] rounded-2xl bg-zinc-800 px-4 py-3 text-sm text-zinc-100">
                  {selectedTask.prompt}
                  {selectedTask.reference_image_base64 && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`data:image/jpeg;base64,${selectedTask.reference_image_base64}`}
                      alt="Reference image"
                      className="mt-2 h-28 w-auto max-w-full rounded-lg border border-zinc-700 object-cover"
                    />
                  )}
                  <p className="mt-1 text-[10px] text-zinc-500">
                    {timeAgo(selectedTask.created_at)}
                    {selectedTask.source === 'telegram' ? ' · Telegram' : ''}
                  </p>
                </div>

                {(selectedTask.agent_logs ?? []).map((log, i) => (
                  <div
                    key={`${log.timestamp}-${i}`}
                    className="max-w-[90%] rounded-xl border border-zinc-800 bg-zinc-950/80 px-3 py-2"
                  >
                    <p className="text-xs font-mono text-zinc-300">
                      <span className="mr-1.5">{AGENT_LOG_ICONS[log.type]}</span>
                      {log.message}
                    </p>
                  </div>
                ))}

                {(selectedTask.feedback_history ?? []).map((entry: FeedbackEntry, i) => (
                  <div
                    key={`${entry.timestamp}-${i}`}
                    className="ml-auto max-w-[85%] rounded-2xl bg-emerald-950/40 border border-emerald-900/50 px-4 py-3 text-sm text-zinc-100"
                  >
                    <p className="text-[10px] uppercase tracking-wide text-emerald-500/80 mb-1">
                      Feedback
                    </p>
                    {entry.message}
                    <p className="mt-1 text-[10px] text-zinc-500">{timeAgo(entry.timestamp)}</p>
                  </div>
                ))}

                {selectedTask.status === 'failed' && selectedTask.error_message && (
                  <div className="rounded-xl border border-red-900/50 bg-red-950/30 px-3 py-2 text-xs text-red-300">
                    {selectedTask.error_message}
                  </div>
                )}

                {(selectedTask.status === 'queued' || selectedTask.status === 'running') && (
                  <p className="text-xs text-zinc-500 animate-pulse">Agent working...</p>
                )}
                <div ref={chatEndRef} />
              </div>

              <div className="border-t border-zinc-800 p-3 space-y-2">
                {error && <p className="text-xs text-red-400">{error}</p>}
                <div className="flex flex-wrap gap-2">
                  {selectedTask.pr_url && (
                    <a
                      href={selectedTask.pr_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-emerald-400 hover:bg-zinc-800"
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
                      className="min-w-0 flex-1 resize-none rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-emerald-600 focus:outline-none"
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
                {selectedTask.status === 'done' && (
                  <p className="text-xs text-emerald-500">Resolved</p>
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center px-6">
              <p className="text-sm text-zinc-400">Select a task or create a new one</p>
              <Button size="sm" onClick={() => setShowNewTask(true)}>
                + New Task
              </Button>
            </div>
          )}
        </section>

        {/* RIGHT: code / diff */}
        <aside
          className={`w-full shrink-0 flex-col border-l border-zinc-800 bg-[#0a0a0c] lg:flex lg:w-[380px] xl:w-[420px] ${
            mobilePane === 'code' ? 'flex' : 'hidden'
          }`}
        >
          <header className="border-b border-zinc-800 px-4 py-3">
            <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide">Code</p>
            <p className="mt-0.5 truncate text-sm text-zinc-200">
              {selectedTask?.pr_title ?? selectedTask?.branch_name ?? 'No file selected'}
            </p>
          </header>
          <div className="min-h-0 flex-1 overflow-auto p-3 space-y-3">
            {selectedTask?.demo_url && (
              <a
                href={selectedTask.demo_url}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-xs text-blue-400 hover:underline"
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
                  className="w-full rounded-lg border border-zinc-800"
                />
              </a>
            )}
            {codeMeta && (
              <pre className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-[11px] font-mono text-zinc-500 whitespace-pre-wrap">
                {codeMeta}
              </pre>
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
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
          <div className="w-full max-w-md space-y-4 rounded-xl border border-zinc-800 bg-zinc-900 p-5">
            <h2 className="text-lg font-semibold">New Task</h2>
            <div className="space-y-1.5">
              <label className="text-xs font-medium uppercase tracking-wide text-zinc-400">
                Repository
              </label>
              <select
                value={selectedRepoId ?? ''}
                onChange={(e) => setSelectedRepoId(e.target.value)}
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
              >
                {repos.map((repo) => (
                  <option key={repo.id} value={repo.id}>
                    {repo.full_name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium uppercase tracking-wide text-zinc-400">
                Prompt
              </label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={4}
                placeholder="add a comment to the readme..."
                className="w-full resize-none rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
              />
            </div>
            {error && <p className="text-xs text-red-400">{error}</p>}
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
