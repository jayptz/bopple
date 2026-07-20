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
    } catch {
      // Sandbox expired or not found, create a new one
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

const APP_DIR_CANDIDATES = ['.', 'website', 'web', 'frontend', 'app', 'client', 'src']

async function findAppDir(session: SandboxSession): Promise<{
  relativeDir: string
  absPath: string
  scripts: Record<string, string>
} | null> {
  for (const relativeDir of APP_DIR_CANDIDATES) {
    const pkgPath = relativeDir === '.' ? 'package.json' : `${relativeDir}/package.json`
    const pkgRaw = await readRepoFile(session, pkgPath).catch(() => null)
    if (!pkgRaw) continue

    try {
      const pkg = JSON.parse(pkgRaw) as {
        scripts?: Record<string, string>
        dependencies?: Record<string, string>
        devDependencies?: Record<string, string>
      }
      const scripts = pkg.scripts ?? {}
      const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) }
      const looksLikeApp =
        Boolean(scripts.dev || scripts.start || scripts.preview) ||
        Boolean(deps.next || deps.vite || deps.react || deps.astro || deps.nuxt)

      if (!looksLikeApp && !scripts.dev && !scripts.start) continue

      const absPath =
        relativeDir === '.' ? session.repoPath : `${session.repoPath}/${relativeDir}`
      return { relativeDir, absPath, scripts }
    } catch {
      continue
    }
  }
  return null
}

async function startStaticServer(session: SandboxSession, port: number): Promise<string> {
  await session.sandbox.commands.run(
    `python3 -m http.server ${port} --bind 0.0.0.0`,
    {
      cwd: session.repoPath,
      background: true,
      stdin: false,
      timeoutMs: 0,
    }
  )
  await new Promise((resolve) => setTimeout(resolve, 3_000))
  return session.sandbox.getHost(port)
}

/** Spin up a preview server so Playwright can screenshot the change. */
export async function tryGenerateDemo(session: SandboxSession): Promise<DemoResult> {
  const logs: string[] = []
  const port = 3000

  const app = await findAppDir(session)

  if (!app) {
    logs.push('No package.json app found — serving repo root as static files.')
    try {
      const demoUrl = await startStaticServer(session, port)
      logs.push(`Preview: ${demoUrl}`)
      return { demoUrl, demoLogs: logs.join('\n\n') }
    } catch (error) {
      logs.push(error instanceof Error ? error.message : 'static server failed')
      return { demoUrl: null, demoLogs: logs.join('\n\n') }
    }
  }

  logs.push(`App directory: ${app.relativeDir}`)

  const scripts = app.scripts
  if (scripts.build) {
    logs.push('=== npm run build ===')
    try {
      const build = await runCommand(
        session,
        'npm run build 2>&1 | tail -40',
        { cwd: app.absPath, timeoutMs: COMMAND_TIMEOUT_MS }
      )
      logs.push(build.stdout || build.stderr || '(no output)')
    } catch (error) {
      logs.push(error instanceof Error ? error.message : 'build failed')
    }
  }

  const scriptName = scripts.dev ? 'dev' : scripts.start ? 'start' : scripts.preview ? 'preview' : null

  if (!scriptName) {
    logs.push('No dev/start/preview script — serving as static files.')
    try {
      const demoUrl = await startStaticServer(session, port)
      logs.push(`Preview: ${demoUrl}`)
      return { demoUrl, demoLogs: logs.join('\n\n') }
    } catch (error) {
      logs.push(error instanceof Error ? error.message : 'static server failed')
      return { demoUrl: null, demoLogs: logs.join('\n\n') }
    }
  }

  try {
    const install = await runCommand(session, 'npm install 2>&1 | tail -30', {
      cwd: app.absPath,
      timeoutMs: COMMAND_TIMEOUT_MS,
    })
    logs.push('=== npm install ===\n' + (install.stdout || install.stderr || ''))
  } catch (error) {
    logs.push(
      '=== npm install ===\n' + (error instanceof Error ? error.message : 'install failed')
    )
    // Still try static fallback from repo root.
    try {
      const demoUrl = await startStaticServer(session, port)
      logs.push(`Install failed — fell back to static server: ${demoUrl}`)
      return { demoUrl, demoLogs: logs.join('\n\n') }
    } catch {
      return { demoUrl: null, demoLogs: logs.join('\n\n') }
    }
  }

  logs.push(`=== starting npm run ${scriptName} on :${port} ===`)
  await session.sandbox.commands.run(`npm run ${scriptName}`, {
    cwd: app.absPath,
    background: true,
    stdin: false,
    envs: { PORT: String(port), HOST: '0.0.0.0', HOSTNAME: '0.0.0.0' },
    timeoutMs: 0,
  })

  // Give Next/Vite time to compile before Playwright hits the URL.
  await new Promise((resolve) => setTimeout(resolve, 15_000))

  const demoUrl = session.sandbox.getHost(port)
  logs.push(`Preview: ${demoUrl}`)

  return { demoUrl, demoLogs: logs.join('\n\n') }
}

export async function closeSandbox(session: SandboxSession, keepAlive = false) {
  if (!keepAlive) {
    await session.sandbox.kill()
  }
}
