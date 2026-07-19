'use client'

import { TaskCard } from '@/components/TaskCard'
import type { Task } from '@/types'

const mockTasks: Task[] = [
  {
    id: '1',
    user_id: 'u1',
    repo_id: 'r1',
    repo_full_name: 'jayptz/jaysportfolio',
    prompt: 'add a comment to the readme',
    status: 'awaiting_feedback',
    branch_name: 'bopple/abc',
    pr_url: 'https://github.com/jayptz/jaysportfolio/pull/1',
    pr_number: 1,
    pr_title: 'docs: add readme comment',
    files_changed: 1,
    lines_added: 1,
    error_message: null,
    source: 'dashboard',
    telegram_chat_id: null,
    trigger_run_id: null,
    model_used: null,
    tokens_used: null,
    sandbox_id: null,
    conversation: null,
    demo_url: null,
    demo_logs: null,
    diff_text: `diff --git a/website/README.md b/website/README.md
--- a/website/README.md
+++ b/website/README.md
@@ -1,3 +1,4 @@
+<!-- hello from Bopple -->
 # Website
`,
    screenshot_url: null,
    agent_logs: [
      { timestamp: new Date().toISOString(), type: 'thinking', message: 'Creating work branch...' },
      { timestamp: new Date().toISOString(), type: 'reading', message: 'Reading website/README.md...' },
      { timestamp: new Date().toISOString(), type: 'thinking', message: 'Asking for your input...' },
    ],
    feedback_history: [
      { timestamp: new Date(Date.now() - 60000).toISOString(), message: 'use website/README.md' },
    ],
    created_at: new Date(Date.now() - 120000).toISOString(),
    started_at: null,
    completed_at: null,
  },
]

/** Old single-column feed UI — for screenshot comparison */
export default function OldDashboardPreviewPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="sticky top-0 z-10 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <div className="font-mono font-bold text-lg">Bopple</div>
          <span className="text-xs text-zinc-500">6 tasks</span>
        </div>
        <nav className="mx-auto flex max-w-2xl gap-1 px-4 pb-2">
          <span className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm">Tasks</span>
          <span className="rounded-lg px-3 py-1.5 text-sm text-zinc-400">Repos</span>
          <span className="rounded-lg px-3 py-1.5 text-sm text-zinc-400">Settings</span>
        </nav>
      </header>
      <main className="mx-auto max-w-2xl space-y-6 px-4 py-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Tasks</h1>
            <p className="text-sm text-zinc-500">Grouped by repository</p>
          </div>
          <button className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium">
            + New Task
          </button>
        </div>
        <select className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm">
          <option>All repos</option>
        </select>
        <section className="space-y-3">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
            <h2 className="font-mono text-sm text-zinc-300">jayptz/jaysportfolio</h2>
            <span className="text-xs text-zinc-600">1 task</span>
          </div>
          <TaskCard task={mockTasks[0]} />
        </section>
      </main>
    </div>
  )
}
