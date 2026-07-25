/**
 * Repo routing + explicit-continuation tests.
 * Uses a representative slice of the live connected-repo naming conventions.
 * Run: npx tsx scripts/test-telegram-routing.ts
 */
import {
  decideTelegramRoute,
  formatResolveLog,
  formatRouteLog,
  normalize,
  resolveRepoFromMessage,
  shortRepoName,
  type ConnectedRepo,
  type ContinuableTaskRef,
} from '../lib/telegram-routing'

/** Representative sample spanning real account naming conventions. */
const repos: ConnectedRepo[] = [
  { id: '1', full_name: 'jayptz/bopple', name: 'bopple' },
  { id: '2', full_name: 'jayptz/yaj-ai', name: 'yaj-ai' },
  { id: '3', full_name: 'jayptz/essential-oils-website', name: 'essential-oils-website' },
  { id: '4', full_name: 'jayptz/jaysportfolio', name: 'jaysportfolio' },
  { id: '5', full_name: 'jayptz/CP317-SoftEng', name: 'CP317-SoftEng' },
  { id: '6', full_name: 'jayptz/OrbitShare', name: 'OrbitShare' },
  { id: '7', full_name: 'jayptz/g1-app', name: 'g1-app' },
  { id: '8', full_name: 'jayptz/my-app', name: 'my-app' },
  { id: '9', full_name: 'jayptz/test-repo', name: 'test-repo' },
]

const taskBoppleRunning: ContinuableTaskRef = {
  id: 'task-bopple',
  repo_full_name: 'jayptz/bopple',
  status: 'running',
}

const taskBoppleAwaiting: ContinuableTaskRef = {
  id: 'task-bopple',
  repo_full_name: 'jayptz/bopple',
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

function route(
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
    connected: repos,
  })
  console.log(`  msg: ${JSON.stringify(message)}`)
  console.log(`  ${formatResolveLog(resolved, repos)}`)
  console.log(`  ${formatRouteLog(decision)}`)
  return { resolved, decision }
}

console.log('\n=== normalize() samples ===\n')
{
  const samples: Array<[string, string]> = [
    ['yaj-ai', 'yajai'],
    ['Yaj.AI', 'yajai'],
    ['YajAI', 'yajai'],
    ['CP317-SoftEng', 'cp317softeng'],
    ['essential-oils-website', 'essentialoilswebsite'],
    ['jaysportfolio', 'jaysportfolio'],
    ['OrbitShare', 'orbitshare'],
    ['g1-app', 'g1app'],
  ]
  for (const [input, expected] of samples) {
    assert(`normalize(${JSON.stringify(input)})`, normalize(input) === expected, normalize(input))
  }
}

console.log('\n=== 1. Casing / separator variants → correct repo ===\n')
{
  const cases: Array<[string, string]> = [
    ['On my Yaj.AI repo, add a Recent Activity section', 'jayptz/yaj-ai'],
    ['on yaj ai fix the navbar', 'jayptz/yaj-ai'],
    ['on YajAI add dark mode', 'jayptz/yaj-ai'],
    ['on yaj-ai send me a screenshot', 'jayptz/yaj-ai'],
    ['on CP317 SoftEng fix the README', 'jayptz/CP317-SoftEng'],
    ['on cp317-softeng add tests', 'jayptz/CP317-SoftEng'],
    ['on OrbitShare tweak the hero', 'jayptz/OrbitShare'],
    ['on orbit share tweak the hero', 'jayptz/OrbitShare'],
    ['on jaysportfolio update the bio', 'jayptz/jaysportfolio'],
    ['on essential-oils-website change the price', 'jayptz/essential-oils-website'],
    ['on essential oils website change the price', 'jayptz/essential-oils-website'],
    ['on g1-app bump the version', 'jayptz/g1-app'],
  ]
  for (const [msg, expected] of cases) {
    const { resolved, decision } = route(msg)
    assert(
      `match ${expected} from ${JSON.stringify(msg).slice(0, 40)}…`,
      resolved.status === 'matched' &&
        resolved.repo.full_name === expected &&
        decision.action === 'new_task' &&
        decision.repo.full_name === expected,
      resolved.status === 'matched'
        ? `got ${resolved.repo.full_name}`
        : `status=${resolved.status}`
    )
  }
}

console.log('\n=== 2. Incidental words must NOT false-match ===\n')
{
  // "for now" must not become unknown "now" or match any repo.
  const { resolved, decision } = route(
    'keep it simple with mock data for now, send me a screenshot'
  )
  assert(
    '"for now" → no_repo_match (not unknown now, not a real repo)',
    resolved.status === 'none' && decision.action === 'no_repo_match',
    resolved.status === 'unknown'
      ? `unknown=${resolved.name}`
      : `${resolved.status}/${decision.action}`
  )

  // "website" alone should not steal essential-oils-website via substring.
  const r2 = resolveRepoFromMessage('update the website copy please', repos)
  assert(
    '"website" alone does not match essential-oils-website',
    r2.status === 'none',
    r2.status === 'matched' ? r2.repo.full_name : r2.status
  )

  // "oils" alone should not match essential-oils-website (needs full normalized sequence).
  const r3 = resolveRepoFromMessage('change the oils section color', repos)
  assert(
    '"oils" alone does not match essential-oils-website',
    r3.status === 'none',
    r3.status === 'matched' ? r3.repo.full_name : r3.status
  )
}

console.log('\n=== 3. Zero matches → no_repo_match, never invent a repo ===\n')
{
  const { decision } = route('add a dark mode toggle')
  assert(
    'no repo named → no_repo_match (NOT new_task on repos[0])',
    decision.action === 'no_repo_match' && decision.connected.length === repos.length
  )

  const { decision: d2 } = route('on totally-fake-repo fix bugs')
  assert(
    'unknown hint → unknown_repo, no task',
    d2.action === 'unknown_repo' && d2.name === 'totally-fake-repo'
  )
}

console.log('\n=== 4. Ambiguous → ask, do not pick ===\n')
{
  // Two repos in one message should be ambiguous.
  const { resolved, decision } = route('on bopple and on yaj-ai add a footer')
  assert(
    'two repos → ambiguous',
    resolved.status === 'ambiguous' && decision.action === 'ask_ambiguous',
    resolved.status === 'ambiguous'
      ? resolved.repos.map((r) => r.full_name).join(',')
      : resolved.status
  )
}

console.log('\n=== 5. Named repo while another task is running → named repo wins ===\n')
{
  const { decision } = route('on yaj-ai add Recent Activity', {
    continuationTask: null, // no reply-to / /reply
  })
  assert(
    'yaj-ai while bopple running elsewhere → new_task on yaj-ai',
    decision.action === 'new_task' && decision.repo.full_name === 'jayptz/yaj-ai'
  )

  // Same message must NOT become feedback on the running bopple task.
  const { decision: d2 } = route('on yaj-ai add Recent Activity', {
    continuationTask: null,
  })
  assert('not feedback on active bopple', d2.action !== 'feedback')
}

console.log('\n=== Explicit continuation still works without re-naming repo ===\n')
{
  const { decision } = route('make the footer smaller', {
    continuationTask: taskBoppleAwaiting,
  })
  assert(
    'reply-to → feedback on bopple task',
    decision.action === 'feedback' && decision.taskId === 'task-bopple'
  )

  const { decision: d2 } = route('make the footer smaller', {
    explicitReply: true,
    continuationTask: taskBoppleRunning,
  })
  assert(
    '/reply → feedback on most recent active',
    d2.action === 'feedback' && d2.reason === 'explicit_reply_command'
  )
}

console.log('\n=== Original Yaj.AI + for now sentence (live shape) ===\n')
{
  const msg =
    'On my Yaj.AI repo, add a Recent Activity section to the dashboard showing the last 5 workflow runs, keep it simple with mock data for now, send me a screenshot.'
  console.log(
    '  connected norms:',
    repos.map((r) => `${shortRepoName(r.full_name)}→${normalize(shortRepoName(r.full_name))}`).join(' | ')
  )
  const { resolved, decision } = route(msg)
  assert(
    'Yaj.AI sentence → jayptz/yaj-ai',
    resolved.status === 'matched' &&
      resolved.repo.full_name === 'jayptz/yaj-ai' &&
      decision.action === 'new_task' &&
      decision.repo.full_name === 'jayptz/yaj-ai',
    resolved.status === 'matched'
      ? resolved.repo.full_name
      : resolved.status === 'unknown'
        ? `unknown=${resolved.name}`
        : resolved.status
  )
}

console.log(`\n${failed === 0 ? 'All routing tests passed.' : `${failed} test(s) failed.`}\n`)
process.exit(failed === 0 ? 0 : 1)
