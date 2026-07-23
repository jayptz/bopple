'use client'

import { useEffect, useRef, useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import {
  AGENT_LOG_ICONS,
  type AgentLogEntry,
  type FeedbackEntry,
  type Task,
} from '@/types'

function timeAgo(date: string) {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

interface TaskCardProps {
  task: Task
  onTaskUpdated?: (task: Task) => void
}

function AgentActivityFeed({ logs }: { logs: AgentLogEntry[] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const recent = logs.slice(-10)
  const latestTimestamp = recent[recent.length - 1]?.timestamp

  useEffect(() => {
    const el = containerRef.current
    if (el) {
      el.scrollTop = el.scrollHeight
    }
  }, [recent.length, latestTimestamp])

  if (recent.length === 0) {
    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-500">
        Waiting for agent activity...
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="max-h-40 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 space-y-1.5 scroll-smooth"
    >
      {recent.map((log, index) => (
        <div
          key={`${log.timestamp}-${index}`}
          className="flex items-start gap-2 text-xs text-zinc-300 font-mono"
        >
          <span className="shrink-0" aria-hidden>
            {AGENT_LOG_ICONS[log.type]}
          </span>
          <span className="min-w-0 break-words">{log.message}</span>
        </div>
      ))}
    </div>
  )
}

function FeedbackHistory({ entries }: { entries: FeedbackEntry[] }) {
  if (entries.length === 0) return null

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
        Previous feedback
      </p>
      <div className="max-h-36 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 space-y-2">
        {entries.map((entry, index) => (
          <div key={`${entry.timestamp}-${index}`} className="space-y-0.5">
            <p className="text-[10px] text-zinc-600">{timeAgo(entry.timestamp)}</p>
            <p className="text-xs text-zinc-300 whitespace-pre-wrap">{entry.message}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

export function TaskCard({ task, onTaskUpdated }: TaskCardProps) {
  const [feedback, setFeedback] = useState('')
  const [sending, setSending] = useState(false)
  const [resolving, setResolving] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canFeedback =
    task.status === 'awaiting_feedback' ||
    (task.status === 'running' && Boolean(task.pr_url))

  const showResolve =
    task.status === 'awaiting_feedback' ||
    task.status === 'failed' ||
    (Boolean(task.pr_url) && task.status !== 'done' && task.status !== 'queued')

  const canStop = task.status === 'running'
  const showActivity =
    task.status === 'running' || task.status === 'awaiting_feedback'
  const logs = task.agent_logs ?? []
  const feedbackHistory = task.feedback_history ?? []

  async function submitFeedback() {
    if (!feedback.trim()) return
    setSending(true)
    setError(null)

    try {
      const res = await fetch(`/api/tasks/${task.id}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedback: feedback.trim() }),
      })

      const data = (await res.json()) as { error?: string; task?: Task }
      if (!res.ok) {
        throw new Error(data.error ?? 'Failed to send feedback')
      }

      setFeedback('')
      if (data.task) onTaskUpdated?.(data.task)
      else {
        onTaskUpdated?.({
          ...task,
          status: 'queued',
          feedback_history: [
            ...feedbackHistory,
            { timestamp: new Date().toISOString(), message: feedback.trim() },
          ],
        })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send feedback')
    } finally {
      setSending(false)
    }
  }

  async function resolveTask() {
    setResolving(true)
    setError(null)

    try {
      const res = await fetch(`/api/tasks/${task.id}/resolve`, { method: 'POST' })
      const data = (await res.json()) as { error?: string; task?: Task }
      if (!res.ok) {
        throw new Error(data.error ?? 'Failed to resolve task')
      }
      if (data.task) onTaskUpdated?.(data.task)
      else onTaskUpdated?.({ ...task, status: 'done' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resolve task')
    } finally {
      setResolving(false)
    }
  }

  async function stopTask() {
    setStopping(true)
    setError(null)
    try {
      const res = await fetch(`/api/tasks/${task.id}/stop`, { method: 'POST' })
      const data = (await res.json()) as { error?: string; task?: Task }
      if (!res.ok) {
        throw new Error(data.error ?? 'Failed to stop task')
      }
      if (data.task) onTaskUpdated?.(data.task)
      else onTaskUpdated?.({ ...task, interrupt_requested_at: new Date().toISOString() })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to stop task')
    } finally {
      setStopping(false)
    }
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="mt-0.5 text-sm text-zinc-200 line-clamp-2">{task.prompt}</p>
        </div>
        <Badge status={task.status} />
      </div>

      {task.reference_image_base64 && (
        <div className="pt-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`data:image/jpeg;base64,${task.reference_image_base64}`}
            alt="Reference image for this task"
            className="h-24 w-auto max-w-full rounded-lg border border-zinc-800 object-cover"
          />
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-zinc-500">
        <span>{timeAgo(task.created_at)}</span>
        {task.source === 'telegram' && <span>via Telegram</span>}
      </div>

      {showActivity && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
            Agent activity
          </p>
          <AgentActivityFeed logs={logs} />
        </div>
      )}

      {task.pr_url && (
        <div className="pt-2 border-t border-zinc-800 space-y-2">
          <a
            href={task.pr_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-emerald-400 hover:text-emerald-300"
          >
            {task.pr_title ?? `PR #${task.pr_number}`} →
          </a>
          {task.files_changed != null && (
            <p className="text-xs text-zinc-500">
              {task.files_changed}{' '}
              {task.files_changed === 1 ? 'file' : 'files'} changed
              {(task.lines_added != null || task.lines_removed != null) && (
                <>
                  {' '}
                  <span className="text-emerald-500">+{task.lines_added ?? 0}</span>
                  {' '}
                  <span className="text-red-400">-{task.lines_removed ?? 0}</span>
                </>
              )}
            </p>
          )}
          {task.demo_url && (
            <a
              href={task.demo_url}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-sm text-blue-400 hover:text-blue-300"
            >
              Live preview →
            </a>
          )}
        </div>
      )}

      {task.screenshot_url && (
        <a
          href={task.screenshot_url}
          target="_blank"
          rel="noopener noreferrer"
          className="block pt-2 border-t border-zinc-800"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={task.screenshot_url}
            alt="Screenshot of the change"
            className="w-full rounded-lg border border-zinc-800"
          />
        </a>
      )}

      {task.demo_logs && (
        <pre className="text-xs text-zinc-500 bg-zinc-950 border border-zinc-800 rounded-lg p-2 overflow-x-auto max-h-32">
          {task.demo_logs.slice(0, 600)}
        </pre>
      )}

      {(canFeedback || feedbackHistory.length > 0 || canStop || showResolve) && (
        <div className="pt-2 border-t border-zinc-800 space-y-3">
          <FeedbackHistory entries={feedbackHistory} />

          {canFeedback && (
            <div className="space-y-2">
              <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wide">
                Feedback
              </label>
              <textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="e.g. use website/README.md and add <!-- hello --> at the top"
                rows={2}
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-emerald-600 focus:outline-none resize-none"
              />
            </div>
          )}

          {error && <p className="text-xs text-red-400">{error}</p>}

          <div className="flex flex-wrap gap-2">
            {canFeedback && (
              <Button size="sm" onClick={submitFeedback} disabled={sending || !feedback.trim()}>
                {sending ? 'Sending...' : 'Send feedback'}
              </Button>
            )}
            {canStop && (
              <Button
                size="sm"
                variant="secondary"
                onClick={stopTask}
                disabled={stopping || Boolean(task.interrupt_requested_at)}
              >
                {stopping || task.interrupt_requested_at ? 'Stopping...' : 'Stop'}
              </Button>
            )}
            {showResolve && (
              <Button
                size="sm"
                variant="secondary"
                onClick={resolveTask}
                disabled={resolving}
              >
                {resolving ? 'Resolving...' : 'Mark resolved'}
              </Button>
            )}
          </div>
        </div>
      )}

      {task.status === 'done' && (
        <p className="text-xs text-emerald-500 border-t border-zinc-800 pt-2">
          Resolved
        </p>
      )}

      {task.status === 'failed' && task.error_message && (
        <p className="text-xs text-red-400 border-t border-zinc-800 pt-2">
          {task.error_message}
        </p>
      )}
    </div>
  )
}
