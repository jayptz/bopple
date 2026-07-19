'use client'

/**
 * Unauthenticated visual preview of the Cursor-style dashboard.
 * Visit /dashboard-preview — delete when no longer needed.
 */
export default function DashboardPreviewPage() {
  return (
    <div className="flex h-dvh flex-col bg-[#0c0c0e] text-zinc-100">
      <header className="flex h-11 items-center justify-between border-b border-zinc-800 px-3">
        <span className="font-mono text-sm font-bold">Bopple</span>
        <span className="text-xs text-zinc-500">6 tasks</span>
      </header>
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-64 flex-col border-r border-zinc-800 bg-[#0a0a0c]">
          <div className="border-b border-zinc-800 p-3">
            <button className="w-full rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium">
              + New Task
            </button>
          </div>
          <div className="space-y-3 overflow-y-auto p-2 text-xs">
            <div>
              <p className="px-2 py-1 font-mono text-zinc-400">jayptz/jaysportfolio</p>
              <div className="rounded-md bg-zinc-800 px-2 py-1.5 text-zinc-100">
                add a comment to the readme
                <p className="mt-1 text-[10px] text-blue-400">Needs input</p>
              </div>
            </div>
            <div>
              <p className="px-2 py-1 font-mono text-zinc-400">jayptz/bopple</p>
              <div className="rounded-md px-2 py-1.5 text-zinc-400">
                fix telegram webhook auth
                <p className="mt-1 text-[10px] text-emerald-400">Resolved</p>
              </div>
            </div>
          </div>
        </aside>
        <section className="flex min-w-0 flex-1 flex-col">
          <header className="border-b border-zinc-800 px-4 py-3">
            <p className="text-sm font-medium">add a comment to the readme</p>
            <p className="font-mono text-xs text-zinc-500">jayptz/jaysportfolio</p>
          </header>
          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            <div className="ml-auto max-w-[80%] rounded-2xl bg-zinc-800 px-4 py-3 text-sm">
              add a comment to the readme
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs font-mono">
              🤔 Creating work branch...
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs font-mono">
              📖 Reading website/README.md...
            </div>
            <div className="ml-auto max-w-[80%] rounded-2xl border border-emerald-900/50 bg-emerald-950/40 px-4 py-3 text-sm">
              <p className="mb-1 text-[10px] uppercase text-emerald-500/80">Feedback</p>
              use website/README.md
            </div>
          </div>
          <div className="border-t border-zinc-800 p-3">
            <textarea
              className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
              rows={2}
              placeholder="Send feedback to continue..."
              readOnly
            />
          </div>
        </section>
        <aside className="flex w-[380px] flex-col border-l border-zinc-800 bg-[#0a0a0c]">
          <header className="border-b border-zinc-800 px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-zinc-400">Code</p>
            <p className="text-sm">docs: add readme comment</p>
          </header>
          <pre className="flex-1 overflow-auto p-4 font-mono text-xs text-zinc-400">
{`# docs: add readme comment
branch: bopple/abc123
files changed: 1

--- website/README.md ---
+ <!-- hello from Bopple -->
  # Website`}
          </pre>
        </aside>
      </div>
    </div>
  )
}
