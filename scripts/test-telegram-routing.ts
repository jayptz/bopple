/**
 * Simulated Telegram message sequence for explicit-continuation routing + repo parsing.
 * Run: npx tsx scripts/test-telegram-routing.ts
 */
import {
  decideTelegramRoute,
  formatRouteLog,
  normalizeRepoToken,
  resolveRepoFromMessage,
  shortRepoName,
  type ConnectedRepo,
  type ContinuableTaskRef,
} from '../lib/telegram-routing'

const repos: ConnectedRepo[] = [
  { id: 'id-a', full_name: 'jayptz/repo-a', name: 'repo-a' },
  { id: 'id-b', full_name: 'jayptz/repo-b', name: 'repo-b' },
  { id: 'id-yaj', full_name: 'jayptz/Yaj.AI', name: 'Yaj.AI' },
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

function simulate(
  message: string,
  opts: {
    forceNew?: boolean
    explicitReply?: boolean
    continuationTask?: ContinuableTaskRef | null
  } = {}
) {
  const resolved = resolveRepoFromMessage(message, repos)
  const decision = decideTelegramRoute({
    forceNew: opts.forceNew ?? false,
    explicitReply: opts.explicitReply ?? false,
    resolved,
    continuationTask: opts.continuationTask ?? null,
  })

  console.log(`  msg: ${JSON.stringify(message)}`)
  console.log(`  ${formatRouteLog(decision)}`)
  return { resolved, decision }
}

console.log('\n--- FIX 2: plain message while A running → always new_task ---\n')
{
  const { decision } = simulate('add a dark mode toggle', {
    continuationTask: null,
  })
  assert(
    'plain message is new_task even if A is running elsewhere',
    decision.action === 'new_task' && decision.reason === 'new_task_default_repo'
  )
}

console.log('\n--- FIX 2: same-repo mention while A awaiting → still new_task ---\n')
{
  const { decision } = simulate('on repo-a make the footer smaller', {
    continuationTask: null,
  })
  assert(
    'repo match does NOT auto-feedback',
    decision.action === 'new_task' &&
      decision.repo?.full_name === 'jayptz/repo-a' &&
      decision.reason === 'new_task_with_matched_repo',
    decision.action === 'feedback' ? `incorrectly feedback to ${decision.taskId}` : undefined
  )
}

console.log('\n--- FIX 2: reply-to Done message → feedback on A ---\n')
{
  const { decision } = simulate('make the footer smaller', {
    continuationTask: taskAAwaiting,
    explicitReply: false,
  })
  assert(
    'telegram reply-to continues A',
    decision.action === 'feedback' &&
      decision.taskId === 'task-a' &&
      decision.reason === 'telegram_reply_to_task_message'
  )
}

console.log('\n--- FIX 2: /reply without reply-to → most recent active ---\n')
{
  // Assumption: webhook passes most recent active as continuationTask for /reply.
  const { decision } = simulate('make the footer smaller', {
    explicitReply: true,
    continuationTask: taskARunning,
  })
  assert(
    '/reply continues most recent active (A)',
    decision.action === 'feedback' &&
      decision.taskId === 'task-a' &&
      decision.reason === 'explicit_reply_command'
  )
}

console.log('\n--- FIX 2: naming B while A running → new on B ---\n')
{
  const { decision } = simulate('on repo-b fix the timeout', {
    continuationTask: null,
  })
  assert(
    'cross-repo message creates new task on B',
    decision.action === 'new_task' && decision.repo?.full_name === 'jayptz/repo-b'
  )
}

console.log('\n--- FIX 3: Yaj.AI message must not match "now" ---\n')
{
  const msg =
    'On my Yaj.AI repo, add a Recent Activity section to the dashboard showing the last 5 workflow runs, keep it simple with mock data for now, send me a screenshot.'

  console.log(
    '  connected:',
    repos.map((r) => `${r.full_name} short=${shortRepoName(r.full_name)} norm=${normalizeRepoToken(shortRepoName(r.full_name))}`).join(' | ')
  )

  const { resolved, decision } = simulate(msg, { continuationTask: null })

  assert(
    'Yaj.AI matched (not unknown/default)',
    resolved.status === 'matched' && resolved.repo.full_name === 'jayptz/Yaj.AI',
    resolved.status === 'unknown'
      ? `unknown name=${resolved.name}`
      : resolved.status === 'matched'
        ? `matched ${resolved.repo.full_name}`
        : resolved.status
  )
  assert(
    'does not report unknown repo "now"',
    !(resolved.status === 'unknown' && resolved.name === 'now')
  )
  assert(
    'new task targets Yaj.AI',
    decision.action === 'new_task' && decision.repo?.full_name === 'jayptz/Yaj.AI'
  )
}

console.log('\n--- FIX 3: "for now" alone must not be unknown ---\n')
{
  const resolved = resolveRepoFromMessage(
    'keep it simple with mock data for now',
    repos
  )
  assert(
    '"for now" → default (stopword), not unknown now',
    resolved.status === 'default',
    resolved.status === 'unknown' ? `got unknown ${resolved.name}` : resolved.status
  )
}

console.log('\n--- FIX 3: YajAI without period still matches ---\n')
{
  const resolved = resolveRepoFromMessage('on YajAI add a navbar', repos)
  assert(
    'punctuation-stripped YajAI matches Yaj.AI',
    resolved.status === 'matched' && resolved.repo.full_name === 'jayptz/Yaj.AI',
    resolved.status === 'matched' ? resolved.repo.full_name : resolved.status
  )
}

console.log(`\n${failed === 0 ? 'All routing tests passed.' : `${failed} test(s) failed.`}\n`)
process.exit(failed === 0 ? 0 : 1)
