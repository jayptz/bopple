import type { TaskStatus } from '@/types'

interface BadgeProps {
  status: TaskStatus
}

const styles: Record<TaskStatus, string> = {
  queued: 'bg-zinc-800 text-zinc-400 border-zinc-700',
  running: 'bg-amber-950 text-amber-400 border-amber-800',
  awaiting_feedback: 'bg-blue-950 text-blue-400 border-blue-800',
  done: 'bg-emerald-950 text-emerald-400 border-emerald-800',
  failed: 'bg-red-950 text-red-400 border-red-800',
}

const labels: Record<TaskStatus, string> = {
  queued: 'Queued',
  running: 'Running',
  awaiting_feedback: 'Needs input',
  done: 'Done',
  failed: 'Failed',
}

export function Badge({ status }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${styles[status]}`}
    >
      {status === 'running' && (
        <span className="mr-1.5 h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
      )}
      {status === 'awaiting_feedback' && (
        <span className="mr-1.5 h-1.5 w-1.5 animate-pulse rounded-full bg-blue-400" />
      )}
      {labels[status]}
    </span>
  )
}
