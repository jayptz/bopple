I built a coding agent you control entirely from Telegram: text a task, it clones your repo into an isolated VM, writes and tests the code, and opens a real pull request.

## Why Telegram

Cursor, Devin, and Jules all solve the same underlying problem, an agent that codes in a cloud VM and hands you back a PR, but each one requires adopting their ecosystem. Cursor needs their app. Devin needs their dashboard or Slack. Jules needs a GitHub label. None of them work from a plain text message on a platform you already have open.

The interesting constraint wasn't the agent, it was making the trigger surface as close to zero-friction as possible. Telegram already has the primitives an agent workflow needs: persistent chat history, a bot API with webhooks, file and image support, and no install step for the user. The tradeoff is that Telegram's interface is a poor substrate for anything richer than text and images, no live diff view, no inline code review, so the dashboard exists specifically to carry the parts of the workflow Telegram can't.

## Architecture

Telegram or dashboard

Task sent as plain text

You text a task to the bot or type it into the dashboard. No install step, no new app to open — the trigger surface is just a message.

Trigger.dev

Durable async job queue

Picks up the job and holds it for as long as the agent needs. A serverless function can't hold a multi-minute session without timing out — Trigger.dev is built for durable execution instead of request-response.

E2B sandbox VM

Isolated clone of your repo

Spins up a real filesystem and shell, not just an API surface. Runs on a custom 4 GB template after the default 1 GB sandbox was silently OOM-killing npm install on larger projects.

Claude agent loop

Reads, writes, tests code

The only stage that's actually AI reasoning. Five tools: bash, read_file, write_file, list_files, ask_user, plus a complete_task call. Narrates one sentence of intent before every tool call.

GitHub pull request

Branch pushed, PR opened

GitHub is the source of truth for what changed, not Bopple's own database. Every write goes through a real branch and PR, never a direct commit.

Telegram + dashboard

PR link and screenshot

You get a Telegram notification with the PR link and a screenshot of the change. The dashboard mirrors the same live activity log in real time.

Jump to details →

Five stages, and each infrastructure choice is solving a specific failure mode of the simpler alternative. A serverless function can't hold a multi-minute agent session without timing out, so the job runs on Trigger.dev, which is built for durable execution rather than request-response. The agent needs a real filesystem and shell, not just an API surface, so it runs inside an E2B VM rather than a container with restricted syscalls. GitHub state needs to be the source of truth for what actually changed, not something Bopple's own database claims happened, so every write goes through a real branch and PR, never a direct commit. The agent loop in the middle is the only stage that's actually AI reasoning, everything around it exists to make that reasoning safe to run unsupervised against a real repository.

## The agent loop

The agent has five tools: `bash`, `read_file`, `write_file`, `list_files`, `ask_user`, plus a `complete_task` call that ends the turn. That's a deliberately small surface. More tools mean more ways for the agent to take an action it can't cleanly undo, `bash` alone is expressive enough to cover install, test, and build without needing dedicated tools for each, and keeping the tool count low made the failure modes easier to reason about and guard against individually.

Before every tool call it narrates one sentence of intent, that narration is what streams into the dashboard and Telegram in real time, not a fixed status string mapped to each tool name. Fixed strings would be cheaper to build but wouldn't say anything true about a specific task, "reading file" doesn't tell you which file or why it matters right now. Free-form narration means every task's log reads differently depending on what's actually happening.

```
Running: cd website3 && npm run build 2>&1 | head -100
Wrapping up changes...
Committing changes and pushing branch...
PR opened!
```

`ask_user` pauses the entire task rather than running async, which trades speed for a hard guarantee, the agent never proceeds on an assumption when it's genuinely uncertain. An async clarification model would keep the sandbox running while waiting on a reply, but that means the agent has to decide what to do in the meantime, and every version of that decision either wastes compute or risks acting on a guess. Pausing is slower and simpler, and simple was the right tradeoff here.

The harder design decision was what the agent is not allowed to do under its own initiative. Two rules came directly out of failures:

Never fabricate the user's work.

Early on, asked for a placeholder blog post, the agent invented a fully detailed but entirely fictional narrative, fake metrics, fake technologies, a story about work that never happened. The fix wasn't a better prompt asking for accuracy, it was an explicit constraint: default to structural placeholders unless there's verified source material for every claim, and use `ask_user` instead of guessing. Correctness pressure alone doesn't stop a capable model from producing a plausible answer when the honest answer is "I don't know," the model isn't lying, it's doing exactly what next-token prediction over a plausible narrative looks like when nothing tells it plausibility isn't the goal.

Never touch files outside its declared scope.

During a failed build, the agent once deleted a lockfile at the repo root as a troubleshooting step, reasoning that it might be the cause. It wasn't, and now a file outside its task boundary was gone. The fix is a hard rule in the system prompt, not a soft preference, an agent debugging its own failure will reach for increasingly invasive fixes if nothing stops it, and "be careful" as an instruction doesn't survive contact with a genuinely stuck agent the way an explicit boundary does.

## Recovering from sandbox failure

E2B sandboxes expire. Resuming a dead sandbox by ID used to crash the job outright instead of falling back to a fresh one.

```
export async function createSandboxSession(
  existingSandboxId?: string | null
): Promise<{ session: SandboxSession; resumed: boolean }> {
  if (existingSandboxId) {
    try {
      const sandbox = await Sandbox.connect(existingSandboxId, {
        timeoutMs: SANDBOX_TIMEOUT_MS,
      })
      // Reset the lifetime clock on resume so long agent runs don't get killed mid-job.
      await sandbox.setTimeout(SANDBOX_TIMEOUT_MS).catch(() => undefined)
      return { session: { sandbox, repoPath: REPO_PATH }, resumed: true }
    } catch (error) {
      console.warn(
        `Failed to resume sandbox ${existingSandboxId}, creating a new one:`,
        error instanceof Error ? error.message : error
      )
    }
  }
  const sandbox = await Sandbox.create('bopple-heavy', {
    timeoutMs: SANDBOX_TIMEOUT_MS,
  })
  return { session: { sandbox, repoPath: REPO_PATH }, resumed: false }
}
```

The bug wasn't the missing fallback itself, it was that the original code treated "resume an existing sandbox" as the only path worth handling explicitly, and let failure propagate up uncaught. Every long-running job needs this same shape, try the fast path, catch specifically, fall through to the slow path, rather than assuming the fast path always succeeds.

## The memory ceiling

Screenshot generation kept failing with `npm install failed (exit -1): (no output)`, no stack trace, no error text, just gone. E2B's default sandbox ships with roughly 1GB of RAM, and `npm install` on a modern Next.js project routinely exceeds that during dependency resolution. The kernel kills the process before it can flush stderr, which is why the failure looked silent rather than loud, a resource kill doesn't get a chance to explain itself the way an application-level error does.

I ruled out every adjacent cause before landing on this: a corrupted lockfile from an earlier bug, wrong working-directory scoping in a monorepo, npm versus pnpm. Each fix was real and necessary, but the install still died identically after every one of them, which is what confirmed it was a resource ceiling rather than a configuration problem, a config bug would have changed the failure signature when fixed, this one didn't move at all. Fixed it by building a custom E2B template with 4GB of RAM, which meant migrating off E2B's v1 build system mid-debugging, since v1 turned out to be fully deprecated and no longer builds at all.

The template build itself:

```
async function main() {
  const buildInfo = await Template.build(template, 'bopple-heavy', {
    cpuCount: 2,
    memoryMB: 4096,
    onBuildLogs: defaultBuildLogger(),
  })
  console.log('\nTemplate build succeeded:')
  console.log(JSON.stringify(buildInfo, null, 2))
}
```

## Scope detection in monorepos

Bopple locks its working directory to wherever the agent actually wrote files, so a build step for one site in a monorepo can't leak into or corrupt a sibling project. The first version of this took the first path segment of a written file as the scope, which worked for a genuine monorepo where that segment is a real subproject, but broke standard single-app repos where the same segment is just a routing folder, not a package boundary. The two cases are structurally different and the naive heuristic couldn't tell them apart. The fix walks up from the written file toward the repo root and stops at the first directory that actually contains a `package.json`, that's the real scope regardless of how many folders deep the file lives, since a `package.json`'s presence is the actual signal for "this is an independent project," not depth or naming convention.

```
async function resolvePackageScopeForPath(
  session: SandboxSession,
  relativePath: string
): Promise<string> {
  const parts = relativePath
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/^\/+/, '')
    .split('/')
    .filter(Boolean)
  // Directory containing the file (drop the filename). Root-level files → [].
  const dirParts = parts.length <= 1 ? [] : parts.slice(0, -1)
  for (let depth = dirParts.length; depth >= 1; depth--) {
    const candidate = dirParts.slice(0, depth).join('/')
    if (await packageJsonExistsInScope(session, candidate)) {
      return candidate
    }
  }
  // Repo root (or no package.json anywhere — still treat as root, never invent "app").
  return '.'
}
```

## Routing follow-up messages to the right task

The first version of this routed messages by matching a repo name in the text, if the mentioned repo matched the currently active task's repo, the message was treated as feedback, otherwise a new task. That worked until a message said "keep it simple with mock data for now," and the parser matched the word "now" against a connected repo, misrouting the whole message. A stopword collision in a regex is a small bug, but it revealed a bigger design problem, deciding new-task-vs-feedback by inference is inherently guessable, and any guess can be wrong in a way that silently writes code to the wrong place.

The fix removes the guess entirely. Every incoming message is a new task by default. A message only continues an existing task if the user explicitly says so, replying directly to that task's Telegram message, or using /reply. Repo-name matching still exists, but it's scoped down to one job: picking which repo a new task targets, it's no longer trusted to decide whether a message is a continuation at all.

```
/**
 * Decide feedback-on-existing-task vs create-new-task.
 *
 * Default: every message creates a NEW task — but only when a single repo
 * is clearly referenced. Zero / ambiguous matches never invent a target repo.
 * Continue an existing task only with an explicit signal:
 *   - Telegram reply-to on that task's Done/update message, or
 *   - `/reply` (targets reply-to if present, else most recent active task).
 */
export function decideTelegramRoute(params: {
  forceNew: boolean
  explicitReply: boolean
  resolved: RepoResolveResult
  continuationTask: ContinuableTaskRef | null
  connected: ConnectedRepo[]
}): TelegramRouteDecision {
  const { forceNew, explicitReply, resolved, continuationTask, connected } = params
  if (!forceNew && continuationTask) {
    return {
      action: 'feedback',
      taskId: continuationTask.id,
      reason: explicitReply
        ? 'explicit_reply_command'
        : 'telegram_reply_to_task_message',
      detectedRepo: resolved.status === 'matched' ? resolved.repo.full_name : null,
      taskRepo: continuationTask.repo_full_name,
    }
  }
  if (resolved.status === 'ambiguous') {
    return {
      action: 'ask_ambiguous',
      repos: resolved.repos,
      reason: forceNew ? 'force_new_ambiguous_repo' : 'ambiguous_repo_in_message',
    }
  }
  if (resolved.status === 'unknown') {
    return {
      action: 'unknown_repo',
      name: resolved.name,
      reason: forceNew ? 'force_new_unknown_repo' : 'unknown_repo_in_message',
    }
  }
  if (resolved.status === 'matched') {
    return {
      action: 'new_task',
      reason: forceNew ? 'force_new' : 'new_task_with_matched_repo',
      detectedRepo: resolved.repo.full_name,
      repo: resolved.repo,
    }
  }
  return {
    action: 'no_repo_match',
    reason: forceNew ? 'force_new_no_repo_match' : 'no_repo_referenced',
    connected,
  }
}
```

Continuation is now explicit by construction rather than inferred. The dashboard already worked this way by accident, its feedback box posts to a specific task ID, so continuation there was always unambiguous, it just took the Telegram side breaking to notice the two surfaces had different guarantees.

## Normalizing repo names before matching

Fixing the routing guess didn't fix a second bug underneath it, resolveRepoFromMessage matched against a repo's literal short name, and GitHub repo names don't have a consistent format. A connected repo named yaj-ai never matched a message that said "Yaj.AI", the hyphen and the period aren't the same character to a regex, so the parser found zero matches and fell through to whatever came next.

The fix normalizes both sides before comparing, strip everything that isn't alphanumeric, lowercase what's left, then match. yaj-ai and Yaj.AI both become yajai.

```
/**
 * Strip all non-alphanumeric characters and lowercase.
 * "Yaj.AI" / "yaj-ai" / "YajAI" / "yaj ai" → "yajai"
 * "CP317-SoftEng" → "cp317softeng"
 */
export function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function messageAlnumTokens(message: string): string[] {
  return message.toLowerCase().match(/[a-z0-9]+/g) ?? []
}

/**
 * True when `needleNorm` equals any contiguous join of message tokens.
 * So "yaj"+"ai" matches normalize("yaj-ai"), and "YajAI" matches as one token,
 * without letting "now" match inside "for now" against an unrelated repo.
 */
function normalizedSequenceMatch(needleNorm: string, tokens: string[]): boolean {
  if (!needleNorm || needleNorm.length < MIN_SHORT_NAME_MATCH_LEN) return false
  if (REPO_HINT_STOPWORDS.has(needleNorm)) return false
  for (let i = 0; i < tokens.length; i++) {
    let acc = ''
    for (let j = i; j < tokens.length; j++) {
      acc += tokens[j]
      if (acc === needleNorm) return true
      if (acc.length > needleNorm.length) break
    }
  }
  return false
}
```

The more important fix was downstream of the parser, not in it. A failed match had been silently falling back to some other repo entirely rather than reporting "not found." Normalizing the names fixes this one collision, but a parser will always eventually miss something, a new repo name, an unusual abbreviation. The actual invariant that matters is that a failed match must never guess, it has to fail loudly and ask, which is the same principle the continuation fix above depends on.

## Stopping a task mid-run

Interrupting an agent that's mid-write is the kind of thing that sounds simple until you think about what "mid-write" actually means for file integrity. The interrupt system checks a flag after each tool call returns rather than killing the process mid-execution, so a file write always finishes atomically before the loop stops. If a tool doesn't return within a timeout, it escalates to a hard kill of the sandbox itself, the assumption being that a hung tool is worse than a lost sandbox, since the sandbox can be recreated but a half-written file can't be un-corrupted.

The soft interrupt check runs at two points in the loop, before starting a new tool and after the current one finishes:

```
// Soft interrupt before starting the next tool (same pause point as ask_user).
const before = await checkSoftInterrupt()
if (before) return before
const input = toolUse.input as Record<string, unknown>
if (onToolCall) {
  await onToolCall(toolUse.name, input)
}
let result: Awaited<ReturnType<typeof executeTool>>
try {
  result = await executeToolMaybeHard(toolUse.name, input)
} catch (error) {
  if (error instanceof HardInterruptError) {
    lastCompletedTool = error.toolName
    return interruptResult(true)
  }
  // Sandbox may die mid-tool after a hard kill race — treat as hard interrupt.
  if (shouldInterrupt && (await shouldInterrupt())) {
    lastCompletedTool = toolUse.name
    return interruptResult(true)
  }
  throw error
}
lastCompletedTool = toolUse.name
// Soft interrupt after the current tool finishes — do not start the next one.
const after = await checkSoftInterrupt()
if (after) return after
```

If the soft path doesn't trigger because a tool is stuck, a background timer polls the interrupt flag and escalates after the timeout:

```
hardTimer = setInterval(() => {
  void (async () => {
    try {
      const flagged = await shouldInterrupt()
      if (!flagged) return
      if (interruptSeenAt == null) interruptSeenAt = Date.now()
      const waited = Date.now() - interruptSeenAt
      if (waited >= HARD_INTERRUPT_MS && hardReject) {
        try {
          await onHardInterrupt?.(name)
        } catch {
          // Best-effort kill — still reject so the loop stops.
        }
        hardReject(new HardInterruptError(name, waited))
      }
    } catch {
      // Ignore poll errors; soft path still works after the tool returns.
    }
  })()
}, 1000)
```

The hard interrupt callback kills the sandbox outright:

```
onHardInterrupt: async (toolName) => {
  const ts = new Date().toISOString()
  console.log(
    `[interrupt] hard task=${taskId} tool=${toolName} at=${ts} waitedMs>=${HARD_INTERRUPT_MS}`
  )
  await appendAgentLog(
    supabase,
    taskId,
    'thinking',
    `Hard interrupt while running ${toolName} (no return within ${HARD_INTERRUPT_MS / 1000}s) — killing sandbox`
  )
  if (session) {
    await closeSandbox(session, false).catch(() => undefined)
  }
},
```

## The screenshot race

A completed task would sometimes send a screenshot that was just a 404 page, even though clicking Live Preview manually a few seconds later worked fine. That gap, works manually right after, fails automatically right before, is the signature of a race condition rather than a logic bug.

There's no separate deploy step in this path, previews come directly from the E2B sandbox's own public host. The screenshot was firing as soon as the PR was created, but the sandbox's public URL isn't guaranteed to be serving yet at that exact moment, tunnel setup and the first compile both take a beat. Capturing immediately meant sometimes capturing before the thing it was capturing existed.

The fix polls the public URL before capturing, up to 60 seconds, long enough for a tunnel and first compile to settle without blocking the job indefinitely. If it times out, the PR still gets sent, just without a screenshot, a missing screenshot is a minor loss, a 404 screenshot is actively misleading.

```
/**
 * Public E2B host can lag behind localhost-ready inside the sandbox.
 * 60s covers typical tunnel + first compile without blocking the job forever;
 * on timeout we skip the screenshot rather than send a broken 404 frame.
 */
export const PREVIEW_READY_TIMEOUT_MS = 60_000
const PREVIEW_READY_POLL_MS = 2_000

function isPreviewEdgeNotReady(status: number | null): boolean {
  // Connection failures → null. 502/503/504 = tunnel/proxy not ready yet.
  // Plain 404 from a live Next app means the host is up (wrong route ≠ not ready).
  if (status == null) return true
  return status === 502 || status === 503 || status === 504
}
```

```
if (!previewReady.ready) {
  screenshotError =
    `Preview URL was not reachable within ${Math.round(PREVIEW_READY_TIMEOUT_MS / 1000)}s — PR link sent without screenshot.`
  await appendAgentLog(supabase, taskId, 'thinking', screenshotError.slice(0, 200))
} else {
  await appendAgentLog(supabase, taskId, 'running', `Capturing screenshot of ${screenshotRoute}...`)
  const captured = await captureScreenshot(demo.demoUrl, screenshotRoute)
}
```

## What's next

The 4GB sandbox template is confirmed working on real repos, but I haven't load-tested it against a repo heavier than what I've thrown at it so far, it's plausible the ceiling just moved rather than disappeared, and the honest answer is I won't know until something bigger hits it.

Task limits exist as columns in the database but aren't enforced yet. The read-modify-write pattern for incrementing usage also wasn't atomic until recently, meaning concurrent requests could undercount, fixed with a Postgres RPC function, but the enforcement layer that actually blocks a user at their limit still needs to be built on top of that count.

GPT-4o is selectable in settings but the agent loop only calls Claude, there's no model routing logic yet, just a setting that doesn't do anything downstream.

## Built with

Next.js · TypeScript · Supabase · E2B · Trigger.dev · Claude · GitHub API · Telegram Bot API · PostgreSQL · Vercel
