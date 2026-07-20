import { CommandExitError, Sandbox } from 'e2b'

const REPO_PATH = '/home/user/repo'
const GIT_USER = 'Bopple Agent'
const GIT_EMAIL = 'agent@bopple.dev'
/** 0 = no command timeout (E2B disables the limit). */
const COMMAND_TIMEOUT_MS = 0
/** Sandbox lifetime — E2B caps at 1h (Hobby) / 24h (Pro). */
const SANDBOX_TIMEOUT_MS = 3_600_000

export { REPO_PATH }

export interface SandboxSession {
  sandbox: Sandbox
  repoPath: string
}

function authCloneUrl(repoFullName: string, githubToken: string) {
  return `https://x-access-token:${githubToken}@github.com/${repoFullName}.git`
}

function shellQuote(value: string) {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

function formatCommandError(command: string, error: unknown): Error {
  if (error instanceof CommandExitError) {
    const details = [error.stderr, error.stdout, error.error]
      .filter(Boolean)
      .join('\n')
      .trim()
      .slice(0, 1500)

    // Never leak the GitHub token if it appeared in the command string.
    const safeCommand = command.replace(/x-access-token:[^@\s]+@/g, 'x-access-token:***@')
    return new Error(
      `Command failed (exit ${error.exitCode}): ${safeCommand}` +
        (details ? `\n${details}` : '')
    )
  }

  if (error instanceof Error) {
    return new Error(error.message.replace(/x-access-token:[^@\s]+@/g, 'x-access-token:***@'))
  }

  return new Error('Command failed')
}

async function runCommand(
  session: SandboxSession,
  command: string,
  options?: { cwd?: string; timeoutMs?: number; allowNonZero?: boolean }
) {
  try {
    return await session.sandbox.commands.run(command, {
      cwd: options?.cwd,
      timeoutMs: options?.timeoutMs ?? COMMAND_TIMEOUT_MS,
      stdin: false,
    })
  } catch (error) {
    if (options?.allowNonZero && error instanceof CommandExitError) {
      return {
        exitCode: error.exitCode,
        stdout: error.stdout,
        stderr: error.stderr,
      }
    }
    throw formatCommandError(command, error)
  }
}

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

  const sandbox = await Sandbox.create({ timeoutMs: SANDBOX_TIMEOUT_MS })
  return { session: { sandbox, repoPath: REPO_PATH }, resumed: false }
}

async function gitConfig(session: SandboxSession) {
  await runInRepo(
    session,
    `git config --global user.name ${shellQuote(GIT_USER)} && git config --global user.email ${shellQuote(GIT_EMAIL)}`
  )
}

export async function hasRepoCheckout(session: SandboxSession): Promise<boolean> {
  const result = await runCommand(session, `test -d ${REPO_PATH}/.git`, {
    timeoutMs: COMMAND_TIMEOUT_MS,
    allowNonZero: true,
  })
  return result.exitCode === 0
}

/**
 * Clone default branch and create a work branch.
 * Never requires a bopple/* branch to already exist on origin — but will
 * check it out from origin if a prior WIP push made it available.
 */
export async function prepareRepo(
  session: SandboxSession,
  repoFullName: string,
  githubToken: string,
  defaultBranch: string,
  branchName: string,
  options?: { resumed?: boolean; continueBranch?: boolean }
) {
  const continueBranch = options?.continueBranch ?? false
  const resumed = options?.resumed ?? false

  if (continueBranch && resumed && (await hasRepoCheckout(session))) {
    await gitConfig(session)
    await createWorkBranch(session, branchName)
    return { cloned: false }
  }

  await cloneRepository(session, repoFullName, githubToken, defaultBranch)

  if (continueBranch) {
    const remote = authCloneUrl(repoFullName, githubToken)
    const checkoutRemote = await runInRepo(
      session,
      `git fetch ${shellQuote(remote)} ${shellQuote(branchName)} && git checkout -B ${shellQuote(branchName)} FETCH_HEAD`,
      COMMAND_TIMEOUT_MS,
      { allowNonZero: true }
    )

    if (checkoutRemote.exitCode === 0) {
      return { cloned: true }
    }
  }

  await createWorkBranch(session, branchName)
  return { cloned: true }
}

export async function cloneRepository(
  session: SandboxSession,
  repoFullName: string,
  githubToken: string,
  defaultBranch: string
) {
  const cloneUrl = authCloneUrl(repoFullName, githubToken)

  try {
    await runCommand(
      session,
      `rm -rf ${REPO_PATH} && git clone --depth 1 --branch ${shellQuote(defaultBranch)} ${shellQuote(cloneUrl)} ${REPO_PATH}`
    )
  } catch {
    await runCommand(
      session,
      `rm -rf ${REPO_PATH} && git clone --depth 1 ${shellQuote(cloneUrl)} ${REPO_PATH}`
    )
  }

  await gitConfig(session)
}

export async function createWorkBranch(session: SandboxSession, branchName: string) {
  const quoted = shellQuote(branchName)
  // Prefer creating a new branch; if it already exists, check it out.
  try {
    await runInRepo(session, `git checkout -b ${quoted}`)
  } catch {
    await runInRepo(session, `git checkout ${quoted}`)
  }
}

export async function runInRepo(
  session: SandboxSession,
  command: string,
  timeoutMs = COMMAND_TIMEOUT_MS,
  options?: { allowNonZero?: boolean }
) {
  const result = await runCommand(session, command, {
    cwd: session.repoPath,
    timeoutMs,
    allowNonZero: options?.allowNonZero,
  })

  return {
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
  }
}

export async function readRepoFile(session: SandboxSession, relativePath: string) {
  const fullPath = `${session.repoPath}/${relativePath.replace(/^\//, '')}`
  return session.sandbox.files.read(fullPath)
}

export async function writeRepoFile(
  session: SandboxSession,
  relativePath: string,
  content: string
) {
  const fullPath = `${session.repoPath}/${relativePath.replace(/^\//, '')}`
  await session.sandbox.files.write(fullPath, content)
}

export async function listRepoDir(session: SandboxSession, relativePath = '.') {
  const fullPath =
    relativePath === '.'
      ? session.repoPath
      : `${session.repoPath}/${relativePath.replace(/^\//, '')}`
  return session.sandbox.files.list(fullPath)
}

const DIFF_MAX_CHARS = 100_000

/** Snapshot of current uncommitted changes (includes untracked via temporary stage). */
export async function getWorkingDiff(session: SandboxSession): Promise<string> {
  await runInRepo(session, 'git add -A', COMMAND_TIMEOUT_MS, { allowNonZero: true })
  const diff = await runInRepo(session, 'git diff --cached', COMMAND_TIMEOUT_MS, {
    allowNonZero: true,
  })
  // Unstage so the agent can keep editing; working tree stays intact.
  await runInRepo(session, 'git reset HEAD', COMMAND_TIMEOUT_MS, { allowNonZero: true })
  return (diff.stdout ?? '').trim().slice(0, DIFF_MAX_CHARS)
}

export async function getLastCommitDiff(session: SandboxSession): Promise<string> {
  const diff = await runInRepo(session, 'git show --format= --patch HEAD', COMMAND_TIMEOUT_MS, {
    allowNonZero: true,
  })
  return (diff.stdout ?? '').trim().slice(0, DIFF_MAX_CHARS)
}

export interface CommitPushResult {
  pushed: boolean
  filesChanged: number
  linesAdded: number
  linesRemoved: number
  diffText: string
}

/** Parse `git diff --shortstat` output into line counts. */
export function parseDiffShortstat(stdout: string): {
  filesChanged: number
  linesAdded: number
  linesRemoved: number
} {
  const text = stdout.trim()
  const filesMatch = text.match(/(\d+)\s+files?\s+changed/)
  const addedMatch = text.match(/(\d+)\s+insertions?\(\+\)/)
  const removedMatch = text.match(/(\d+)\s+deletions?\(-\)/)
  return {
    filesChanged: filesMatch ? Number(filesMatch[1]) : 0,
    linesAdded: addedMatch ? Number(addedMatch[1]) : 0,
    linesRemoved: removedMatch ? Number(removedMatch[1]) : 0,
  }
}

async function getCommitShortstat(session: SandboxSession): Promise<{
  filesChanged: number
  linesAdded: number
  linesRemoved: number
}> {
  const result = await runInRepo(session, 'git diff --shortstat HEAD~1 HEAD', COMMAND_TIMEOUT_MS, {
    allowNonZero: true,
  })
  return parseDiffShortstat(result.stdout ?? '')
}

export async function commitAndPush(
  session: SandboxSession,
  githubToken: string,
  message: string,
  branchName: string,
  repoFullName: string
): Promise<CommitPushResult> {
  const status = await runInRepo(session, 'git status --porcelain')
  if (!status.stdout.trim()) {
    // Still push the branch so feedback resumes can clone it later if needed.
    await pushBranch(session, githubToken, branchName, repoFullName)
    const existing = await getLastCommitDiff(session).catch(() => '')
    const stats = await getCommitShortstat(session).catch(() => ({
      filesChanged: 0,
      linesAdded: 0,
      linesRemoved: 0,
    }))
    return {
      pushed: false,
      filesChanged: stats.filesChanged,
      linesAdded: stats.linesAdded,
      linesRemoved: stats.linesRemoved,
      diffText: existing,
    }
  }

  const remote = authCloneUrl(repoFullName, githubToken)

  await runInRepo(session, 'git add -A')
  const stagedDiff = await runInRepo(session, 'git diff --cached', COMMAND_TIMEOUT_MS, {
    allowNonZero: true,
  })
  await runInRepo(session, `git commit -m ${shellQuote(message)}`)
  await runInRepo(
    session,
    `git push -u ${shellQuote(remote)} ${shellQuote(branchName)}`
  )

  const fileCount = status.stdout.trim().split('\n').filter(Boolean).length
  const diffText = (stagedDiff.stdout ?? '').trim().slice(0, DIFF_MAX_CHARS)
  const stats = await getCommitShortstat(session).catch(() => ({
    filesChanged: fileCount,
    linesAdded: 0,
    linesRemoved: 0,
  }))
  return {
    pushed: true,
    filesChanged: stats.filesChanged || fileCount,
    linesAdded: stats.linesAdded,
    linesRemoved: stats.linesRemoved,
    diffText,
  }
}

/** Push the current branch to origin (creates remote branch if missing). */
export async function pushBranch(
  session: SandboxSession,
  githubToken: string,
  branchName: string,
  repoFullName: string
) {
  const remote = authCloneUrl(repoFullName, githubToken)
  await runInRepo(
    session,
    `git push -u ${shellQuote(remote)} ${shellQuote(branchName)}`
  )
}

export interface DemoResult {
  demoUrl: string | null
  demoLogs: string
}

/** Install once, then retry only the server start. Never reinstall in a loop. */
const DEV_SERVER_START_ATTEMPTS = 2
/** Health-check polls while waiting for the scoped server (1s each). */
const SERVER_READY_MAX_ATTEMPTS = 20
const SERVER_READY_POLL_MS = 1_000

/**
 * Derive the working directory scope from paths the agent wrote during the task.
 * e.g. "website3/lib/blog-posts.ts" → "website3"; root-level files → "."
 */
export function deriveWorkingScope(writtenPaths: string[]): string | null {
  const normalized = writtenPaths
    .map((p) => p.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '').trim())
    .filter(Boolean)

  if (normalized.length === 0) return null

  const counts = new Map<string, number>()
  for (const path of normalized) {
    const parts = path.split('/').filter(Boolean)
    const scope = parts.length <= 1 ? '.' : parts[0]
    counts.set(scope, (counts.get(scope) ?? 0) + 1)
  }

  // Prefer a subdirectory scope over "." when both appear.
  const ranked = Array.from(counts.entries()).sort((a, b) => {
    if (a[0] === '.' && b[0] !== '.') return 1
    if (b[0] === '.' && a[0] !== '.') return -1
    return b[1] - a[1]
  })

  return ranked[0]?.[0] ?? null
}

function scopeLabel(workingScope: string): string {
  const scope = workingScope.trim().replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '')
  return !scope || scope === '.' ? '.' : scope
}

function resolveScopeAbsPath(session: SandboxSession, workingScope: string): string {
  const label = scopeLabel(workingScope)
  if (label === '.') return session.repoPath
  return `${session.repoPath}/${label}`
}

/**
 * Hard guard: every demo command must use the scoped absolute path.
 * Subdirectory scopes must never resolve back to the repo root.
 */
function assertScopedCwd(
  session: SandboxSession,
  label: string,
  absPath: string
): string | null {
  if (!absPath.startsWith(session.repoPath)) {
    return `Refusing demo cwd outside repo: ${absPath}`
  }
  if (label !== '.' && absPath === session.repoPath) {
    return `Refusing to run demo at repo root — workingScope is "${label}"`
  }
  if (label !== '.' && absPath !== `${session.repoPath}/${label}`) {
    return `Demo cwd drift detected: expected ${session.repoPath}/${label}, got ${absPath}`
  }
  return null
}

async function packageJsonExistsInScope(
  session: SandboxSession,
  label: string
): Promise<boolean> {
  const pkgPath = label === '.' ? 'package.json' : `${label}/package.json`
  const pkgRaw = await readRepoFile(session, pkgPath).catch(() => null)
  return Boolean(pkgRaw?.trim())
}

async function readPackageScriptsInScope(
  session: SandboxSession,
  label: string
): Promise<Record<string, string> | null> {
  const pkgPath = label === '.' ? 'package.json' : `${label}/package.json`
  const pkgRaw = await readRepoFile(session, pkgPath).catch(() => null)
  if (!pkgRaw) return null

  try {
    const pkg = JSON.parse(pkgRaw) as { scripts?: Record<string, string> }
    return pkg.scripts ?? {}
  } catch {
    return null
  }
}

/**
 * Poll localhost inside the sandbox until the port accepts HTTP connections.
 * Any HTTP status (including 404/500) counts as ready; connection refused does not.
 */
async function waitForLocalPort(
  session: SandboxSession,
  port: number,
  logs: string[]
): Promise<boolean> {
  const waitLogs: string[] = []

  for (let attempt = 1; attempt <= SERVER_READY_MAX_ATTEMPTS; attempt++) {
    waitLogs.push(
      `Waiting for server on :${port} (attempt ${attempt}/${SERVER_READY_MAX_ATTEMPTS})...`
    )

    try {
      const result = await runCommand(
        session,
        `curl -s -o /dev/null -w "%{http_code}" --connect-timeout 1 --max-time 2 http://127.0.0.1:${port}/`,
        { allowNonZero: true, timeoutMs: 5_000 }
      )
      const code = (result.stdout ?? '').trim()
      // curl returns "000" when the connection fails (refused / timed out).
      if (/^[1-5]\d{2}$/.test(code)) {
        waitLogs.push(`Server ready on :${port} (HTTP ${code})`)
        logs.push(waitLogs.join('\n'))
        return true
      }
    } catch {
      // Treat probe failures as not-ready and keep polling.
    }

    if (attempt < SERVER_READY_MAX_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, SERVER_READY_POLL_MS))
    }
  }

  waitLogs.push('Dev server did not become ready in time')
  logs.push(waitLogs.join('\n'))
  return false
}

async function freeLocalPort(session: SandboxSession, port: number): Promise<void> {
  await runCommand(
    session,
    `(fuser -k ${port}/tcp 2>/dev/null || true); (pkill -f "next dev" 2>/dev/null || true); (pkill -f "vite" 2>/dev/null || true); sleep 0.5`,
    { allowNonZero: true, timeoutMs: 10_000 }
  ).catch(() => undefined)
}

function skipScreenshot(logs: string[], label: string, attempts: number, lastError: string): DemoResult {
  logs.push(
    `Could not start dev server in ${label} after ${attempts} attempts — skipped screenshot. Last error: ${lastError}`
  )
  return { demoUrl: null, demoLogs: logs.join('\n\n') }
}

/**
 * Spin up a preview server strictly inside workingScope.
 * Hard boundary: never install/build/dev at repo root when workingScope is a subdirectory,
 * and never fall back to a different directory after failures.
 */
export async function tryGenerateDemo(
  session: SandboxSession,
  workingScope: string
): Promise<DemoResult> {
  const logs: string[] = []
  const port = 3000
  const label = scopeLabel(workingScope)
  const absPath = resolveScopeAbsPath(session, workingScope)

  logs.push(`Working scope (hard boundary): ${label}`)
  logs.push(`Demo cwd: ${absPath}`)

  const cwdError = assertScopedCwd(session, label, absPath)
  if (cwdError) {
    logs.push(cwdError)
    return skipScreenshot(logs, label, 0, cwdError)
  }

  // Step 4: verify package.json at the exact scoped path before any npm command.
  const hasPackageJson = await packageJsonExistsInScope(session, label)
  if (!hasPackageJson) {
    const err = `No package.json at ${label === '.' ? 'package.json' : `${label}/package.json`} — skipped dependency install and screenshot`
    logs.push(err)
    return skipScreenshot(logs, label, 0, err)
  }

  const scripts = await readPackageScriptsInScope(session, label)
  if (!scripts) {
    const err = `Could not parse package.json in ${label} — skipped screenshot`
    logs.push(err)
    return skipScreenshot(logs, label, 0, err)
  }

  const scriptName = scripts.dev
    ? 'dev'
    : scripts.start
      ? 'start'
      : scripts.preview
        ? 'preview'
        : null

  if (!scriptName) {
    const err = `No dev/start/preview script in ${label}/package.json — skipped screenshot`
    logs.push(err)
    return skipScreenshot(logs, label, 0, err)
  }

  // --- Install once (never in a retry loop, never outside absPath) ---
  logs.push(`=== npm install/ci once in ${label} ===`)
  const installCmd =
    '(test -f package-lock.json || test -f npm-shrinkwrap.json) && npm ci || npm install'

  try {
    const install = await runCommand(session, installCmd, {
      cwd: absPath,
      timeoutMs: COMMAND_TIMEOUT_MS,
      allowNonZero: true,
    })
    const installOut = (install.stdout || install.stderr || '').trim().slice(-2500)
    logs.push(`npm install/ci exit ${install.exitCode}\n${installOut || '(no output)'}`)
    if (install.exitCode !== 0) {
      return skipScreenshot(
        logs,
        label,
        1,
        installOut.slice(0, 300) || `npm install/ci exited ${install.exitCode}`
      )
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'install failed'
    logs.push(detail)
    return skipScreenshot(logs, label, 1, detail)
  }

  // --- Build once (best-effort; `dev` may still work if build fails) ---
  if (scripts.build) {
    logs.push(`=== npm run build once in ${label} ===`)
    try {
      const build = await runCommand(session, 'npm run build', {
        cwd: absPath,
        timeoutMs: COMMAND_TIMEOUT_MS,
        allowNonZero: true,
      })
      const buildOut = (build.stdout || build.stderr || '').trim().slice(-2500)
      logs.push(`npm run build exit ${build.exitCode}\n${buildOut || '(no output)'}`)
    } catch (error) {
      logs.push(error instanceof Error ? error.message : 'build failed')
    }
  }

  // --- Start server: at most DEV_SERVER_START_ATTEMPTS tries, same cwd every time ---
  let lastError = 'unknown error'

  for (let attempt = 1; attempt <= DEV_SERVER_START_ATTEMPTS; attempt++) {
    logs.push(
      `=== start npm run ${scriptName} attempt ${attempt}/${DEV_SERVER_START_ATTEMPTS} (cwd: ${label}) ===`
    )
    await freeLocalPort(session, port)

    // Re-assert scope before every start — no silent cwd drift.
    const startCwdError = assertScopedCwd(session, label, absPath)
    if (startCwdError) {
      return skipScreenshot(logs, label, attempt, startCwdError)
    }

    try {
      await session.sandbox.commands.run(`npm run ${scriptName}`, {
        cwd: absPath,
        background: true,
        stdin: false,
        envs: { PORT: String(port), HOST: '0.0.0.0', HOSTNAME: '0.0.0.0' },
        timeoutMs: 0,
      })
    } catch (error) {
      lastError = error instanceof Error ? error.message : `failed to start npm run ${scriptName}`
      logs.push(lastError)
      continue
    }

    const ready = await waitForLocalPort(session, port, logs)
    if (ready) {
      const demoUrl = session.sandbox.getHost(port)
      logs.push(`Preview: ${demoUrl}`)
      return { demoUrl, demoLogs: logs.join('\n\n') }
    }

    lastError = 'Dev server did not become ready on :3000'
  }

  return skipScreenshot(logs, label, DEV_SERVER_START_ATTEMPTS, lastError)
}

export async function closeSandbox(session: SandboxSession, keepAlive = false) {
  if (!keepAlive) {
    await session.sandbox.kill()
  }
}
