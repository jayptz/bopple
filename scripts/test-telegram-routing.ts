/**
 * Simulated Telegram message sequence for repo-aware feedback routing.
 * Run: npx tsx scripts/test-telegram-routing.ts
 */
import {
  decideTelegramRoute,
  formatRouteLog,
  resolveRepoFromMessage,
  type ConnectedRepo,
  type ContinuableTaskRef,
} from '../lib/telegram-routing'

const repos: ConnectedRepo[] = [
  { id: 'id-a', full_name: 'jayptz/repo-a', name: 'repo-a' },
  { id: 'id-b', full_name: 'jayptz/repo-b', name: 'repo-b' },
]

const taskARunning: ContinuableTaskRef = {
  id: 'task-a',
  repo_full_name: 'jayptz/repo-a',
  status: 'running',
}

const taskAAwaiting: ContinuableTaskRef = {
  id: 'task-a',
  repo_full_name: 'jayptz/repo-a',
  status: 'awaiting_feedback',
}

let failed = 0

function assert(name: string, cond: boolean, detail?: string) {
  if (cond) {
    console.log(`PASS  ${name}`)
  } else {
    failed += 1
    console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

function simulate(message: string, activeByRepo: Record<string, ContinuableTaskRef | null>) {
  const resolved = resolveRepoFromMessage(message, repos)
  const activeTaskForMatchedRepo =
    resolved.status === 'matched'
      ? activeByRepo[resolved.repo.full_name] ?? null
      : null
  const openTaskNoRepo =
    resolved.status === 'default' ? activeByRepo['__open__'] ?? null : null

  const decision = decideTelegramRoute({
    forceNew: false,
    resolved,
    activeTaskForMatchedRepo,
    openTaskNoRepo,
  })

  console.log(`  msg: ${JSON.stringify(message)}`)
  console.log(`  ${formatRouteLog(decision)}`)
  return decision
}

console.log('\n--- Sequence 1: task on A running, then message naming B ---\n')
{
  const d1 = simulate('on repo-a add a navbar', {
    'jayptz/repo-a': null,
    'jayptz/repo-b': null,
  })
  assert('1a new task on A', d1.action === 'new_task' && d1.repo?.full_name === 'jayptz/repo-a')

  // A is now running; user messages about B before A finishes
  const d2 = simulate('on repo-b fix the timeout', {
    'jayptz/repo-a': taskARunning,
    'jayptz/repo-b': null,
  })
  assert(
    '1b MUST create new task on B (not feedback on A)',
    d2.action === 'new_task' && d2.repo?.full_name === 'jayptz/repo-b',
    d2.action === 'feedback' ? `incorrectly feedback to ${d2.taskId}` : undefined
  )
  assert(
    '1b must not touch task-a',
    !(d2.action === 'feedback' && d2.taskId === 'task-a')
  )
}

console.log('\n--- Sequence 2: task on A awaiting, follow-up with no repo ---\n')
{
  const d = simulate('also add a footer', {
    'jayptz/repo-a': taskAAwaiting,
    'jayptz/repo-b': null,
    __open__: taskAAwaiting,
  })
  assert(
    '2 feedback on A when no repo mentioned',
    d.action === 'feedback' && d.taskId === 'task-a' && d.reason === 'no_repo_in_message_continue_open_task'
  )
}

console.log('\n--- Sequence 3: task on A awaiting, message naming A again ---\n')
{
  const d = simulate('on repo-a make the footer smaller', {
    'jayptz/repo-a': taskAAwaiting,
    'jayptz/repo-b': null,
  })
  assert(
    '3 feedback on A when same repo mentioned',
    d.action === 'feedback' && d.taskId === 'task-a' && d.reason === 'repo_matches_active_task'
  )
}

console.log('\n--- Sequence 4: A running + B awaiting; message for A ---\n')
{
  const taskB: ContinuableTaskRef = {
    id: 'task-b',
    repo_full_name: 'jayptz/repo-b',
    status: 'awaiting_feedback',
  }
  const d = simulate('on repo-a also tweak the title', {
    'jayptz/repo-a': taskARunning,
    'jayptz/repo-b': taskB,
    __open__: taskB, // globally most recent would be B — must NOT use that
  })
  assert(
    '4 match per-repo not global (feedback to A, not B)',
    d.action === 'feedback' && d.taskId === 'task-a',
    d.action === 'feedback' ? `got task ${d.taskId}` : `got ${d.action}`
  )
}

console.log('\n--- Sequence 5: no repo, no open task → new ---\n')
{
  const d = simulate('add dark mode', {
    'jayptz/repo-a': null,
    'jayptz/repo-b': null,
    __open__: null,
  })
  assert('5 new task with default repo', d.action === 'new_task' && d.repo === null)
}

console.log(`\n${failed === 0 ? 'All routing tests passed.' : `${failed} test(s) failed.`}\n`)
process.exit(failed === 0 ? 0 : 1)
