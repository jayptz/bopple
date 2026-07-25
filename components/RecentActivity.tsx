import { Badge } from '@/components/ui/Badge'
import type { TaskStatus } from '@/types'

interface WorkflowRun {
  id: string
  name: string
  status: TaskStatus
  timestamp: string
  repo: string
}

// Mock data for now
const mockRuns: WorkflowRun[] = [
  {
    id: '1',
    name: 'Add dark mode toggle',
    status: 'done',
    timestamp: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
    repo: 'owner/repo-1',
  },
  {
    id: '2',
    name: 'Fix navigation bug',
    status: 'running',
    timestamp: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
    repo: 'owner/repo-2',
  },
  {
    id: '3',
    name: 'Update dependencies',
    status: 'awaiting_feedback',
    timestamp: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
    repo: 'owner/repo-1',
  },
  {
    id: '4',
    name: 'Refactor auth flow',
    status: 'done',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
    repo: 'owner/repo-3',
  },
  {
    id: '5',
    name: 'Add API documentation',
    status: 'failed',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
    repo: 'owner/repo-2',
  },
]

function timeAgo(date: string) {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export function RecentActivity() {
  return (
    <div className="border-b border-zinc-800 p-3">
      <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-zinc-400">
        Recent Activity
      </h3>
      <div className="space-y-2">
        {mockRuns.map((run) => (
          <div
            key={run.id}
            className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-2.5 hover:bg-zinc-900/50 transition-colors cursor-pointer"
          >
            <div className="flex items-start justify-between gap-2 mb-1.5">
              <p className="text-xs font-medium text-zinc-200 line-clamp-1">{run.name}</p>
              <Badge status={run.status} />
            </div>
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] text-zinc-500 font-mono truncate">{run.repo}</p>
              <p className="text-[10px] text-zinc-500 whitespace-nowrap">{timeAgo(run.timestamp)}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
