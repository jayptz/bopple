'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { TaskCard } from '@/components/TaskCard'
import { Button } from '@/components/ui/Button'
import { RepoSelector } from '@/components/RepoSelector'
import type { Task, Repo } from '@/types'

export default function DashboardPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [repos, setRepos] = useState<Repo[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [selectedRepoId, setSelectedRepoId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const [tasksRes, reposRes] = await Promise.all([
        fetch('/api/tasks'),
        supabase.from('repos').select('*').eq('is_active', true),
      ])

      if (tasksRes.ok) {
        const data = (await tasksRes.json()) as { tasks: Task[] }
        setTasks(data.tasks)
      }

      if (reposRes.data) {
        setRepos(reposRes.data as Repo[])
        const first = reposRes.data[0]
        if (first) setSelectedRepoId(first.id)
      }

      setLoading(false)
    }

    load()

    const channel = supabase
      .channel('tasks')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tasks' },
        (payload) => {
          const updated = payload.new as Task
          setTasks((prev) => {
            const exists = prev.find((t) => t.id === updated.id)
            if (exists) {
              return prev.map((t) => (t.id === updated.id ? updated : t))
            }
            return [updated, ...prev]
          })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!prompt.trim() || !selectedRepoId) return

    setSubmitting(true)
    setError(null)

    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim(), repo_id: selectedRepoId }),
      })

      if (!res.ok) {
        const data = (await res.json()) as { error?: string }
        throw new Error(data.error ?? 'Failed to create task')
      }

      const data = (await res.json()) as { task: Task }
      setTasks((prev) => [data.task, ...prev])
      setPrompt('')
      setShowModal(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">Tasks</h1>
          <p className="text-sm text-zinc-500">Live feed of agent runs</p>
        </div>
        <Button onClick={() => setShowModal(true)} size="sm">
          + New Task
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-zinc-900" />
          ))}
        </div>
      ) : tasks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-800 p-8 text-center">
          <p className="text-zinc-500 text-sm">No tasks yet.</p>
          <p className="text-zinc-600 text-xs mt-1">
            Send a prompt from Telegram or create one here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} />
          ))}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-900 p-5 space-y-4">
            <h2 className="text-lg font-semibold text-zinc-100">New Task</h2>

            <RepoSelector
              savedRepos={repos}
              selectedRepoId={selectedRepoId}
              onSelect={setSelectedRepoId}
            />

            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wide">
                Prompt
              </label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="add input validation to the signup form..."
                rows={4}
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-emerald-600 focus:outline-none resize-none"
              />
            </div>

            {error && <p className="text-xs text-red-400">{error}</p>}

            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => setShowModal(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
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
