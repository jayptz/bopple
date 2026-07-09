import { Badge } from '@/components/ui/Badge'
import type { Task } from '@/types'

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
}

export function TaskCard({ task }: TaskCardProps) {
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

      {task.status === 'done' && task.pr_url && (
        <div className="pt-2 border-t border-zinc-800">
          <a
            href={task.pr_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-emerald-400 hover:text-emerald-300"
          >
            {task.pr_title ?? `PR #${task.pr_number}`} →
          </a>
          {task.files_changed != null && (
            <p className="mt-1 text-xs text-zinc-500">
              {task.files_changed} files · +{task.lines_added ?? 0} lines
            </p>
          )}
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
