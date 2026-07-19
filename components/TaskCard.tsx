'use client'

import { useEffect, useRef, useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { AGENT_LOG_ICONS, type AgentLogEntry, type Task } from '@/types'

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
  onFeedbackSent?: () => void
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

export function TaskCard({ task, onFeedbackSent }: TaskCardProps) {
  const [feedback, setFeedback] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const canFeedback =
    task.status === 'awaiting_feedback' ||
    task.status === 'done' ||
    (task.status === 'running' && Boolean(task.pr_url))

  const showActivity =
    task.status === 'running' || task.status === 'awaiting_feedback'
  const logs = task.agent_logs ?? []

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

      if (!res.ok) {
        const data = (await res.json()) as { error?: string }
        throw new Error(data.error ?? 'Failed to send feedback')
      }

      setFeedback('')
      onFeedbackSent?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send feedback')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-zinc-500 font-mono truncate">{task.repo_full_name}</p>
          <p className="mt-1 text-sm text-zinc-200 line-clamp-2">{task.prompt}</p>
        </div>
        <Badge status={task.status} />
      </div>

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
              {task.files_changed} files changed
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

      {task.demo_logs && (
        <pre className="text-xs text-zinc-500 bg-zinc-950 border border-zinc-800 rounded-lg p-2 overflow-x-auto max-h-32">
          {task.demo_logs.slice(0, 600)}
        </pre>
      )}

      {canFeedback && (
        <div className="pt-2 border-t border-zinc-800 space-y-2">
          <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wide">
            Feedback
          </label>
          <textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="Make the button larger, add tests..."
            rows={2}
            className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-emerald-600 focus:outline-none resize-none"
          />
          {error && <p className="text-xs text-red-400">{error}</p>}
          <Button size="sm" onClick={submitFeedback} disabled={sending || !feedback.trim()}>
            {sending ? 'Sending...' : 'Send feedback'}
          </Button>
        </div>
      )}

      {task.status === 'failed' && task.error_message && (
        <p className="text-xs text-red-400 border-t border-zinc-800 pt-2">
          {task.error_message}
        </p>
      )}
    </div>
  )
}
