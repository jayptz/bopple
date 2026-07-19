import { CommandExitError, Sandbox } from 'e2b'

const REPO_PATH = '/home/user/repo'
const GIT_USER = 'Bopple Agent'
const GIT_EMAIL = 'agent@bopple.dev'
const COMMAND_TIMEOUT_MS = 120_000

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
      const sandbox = await Sandbox.connect(existingSandboxId, { timeoutMs: 900_000 })
      return { session: { sandbox, repoPath: REPO_PATH }, resumed: true }
    } catch {
      // Sandbox expired or not found, create a new one
    }
  }

  const sandbox = await Sandbox.create({ timeoutMs: 900_000 })
  return { session: { sandbox, repoPath: REPO_PATH }, resumed: false }
}

async function gitConfig(session: SandboxSession) {
  await runInRepo(
    session,
    `git config --global user.name ${shellQuote(GIT_USER)} && git config --global user.email ${shellQuote(GIT_EMAIL)}`,
    30_000
  )
}

export async function hasRepoCheckout(session: SandboxSession): Promise<boolean> {
  const result = await runCommand(session, `test -d ${REPO_PATH}/.git`, {
    timeoutMs: 15_000,
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
      120_000,
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
      `rm -rf ${REPO_PATH} && git clone --depth 1 --branch ${shellQuote(defaultBranch)} ${shellQuote(cloneUrl)} ${REPO_PATH}`,
      { timeoutMs: 180_000 }
    )
  } catch {
    await runCommand(
      session,
      `rm -rf ${REPO_PATH} && git clone --depth 1 ${shellQuote(cloneUrl)} ${REPO_PATH}`,
      { timeoutMs: 180_000 }
    )
  }

  await gitConfig(session)
}

export async function createWorkBranch(session: SandboxSession, branchName: string) {
  const quoted = shellQuote(branchName)
  // Prefer creating a new branch; if it already exists, check it out.
  try {
    await runInRepo(session, `git checkout -b ${quoted}`, 30_000)
  } catch {
    await runInRepo(session, `git checkout ${quoted}`, 30_000)
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
  await runInRepo(session, 'git add -A', 60_000, { allowNonZero: true })
  const diff = await runInRepo(session, 'git diff --cached', 60_000, {
    allowNonZero: true,
  })
  // Unstage so the agent can keep editing; working tree stays intact.
  await runInRepo(session, 'git reset HEAD', 30_000, { allowNonZero: true })
  return (diff.stdout ?? '').trim().slice(0, DIFF_MAX_CHARS)
}

export async function getLastCommitDiff(session: SandboxSession): Promise<string> {
  const diff = await runInRepo(session, 'git show --format= --patch HEAD', 60_000, {
    allowNonZero: true,
  })
  return (diff.stdout ?? '').trim().slice(0, DIFF_MAX_CHARS)
}

export async function commitAndPush(
  session: SandboxSession,
  githubToken: string,
  message: string,
  branchName: string,
  repoFullName: string
) {
  const status = await runInRepo(session, 'git status --porcelain', 30_000)
  if (!status.stdout.trim()) {
    // Still push the branch so feedback resumes can clone it later if needed.
    await pushBranch(session, githubToken, branchName, repoFullName)
    const existing = await getLastCommitDiff(session).catch(() => '')
    return { pushed: false, filesChanged: 0, diffText: existing }
  }

  const remote = authCloneUrl(repoFullName, githubToken)

  await runInRepo(session, 'git add -A', 60_000)
  const stagedDiff = await runInRepo(session, 'git diff --cached', 60_000, {
    allowNonZero: true,
  })
  await runInRepo(session, `git commit -m ${shellQuote(message)}`, 60_000)
  await runInRepo(
    session,
    `git push -u ${shellQuote(remote)} ${shellQuote(branchName)}`,
    180_000
  )

  const fileCount = status.stdout.trim().split('\n').filter(Boolean).length
  const diffText = (stagedDiff.stdout ?? '').trim().slice(0, DIFF_MAX_CHARS)
  return { pushed: true, filesChanged: fileCount, diffText }
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
    `git push -u ${shellQuote(remote)} ${shellQuote(branchName)}`,
    180_000
  )
}

export interface DemoResult {
  demoUrl: string | null
  demoLogs: string
}

export async function tryGenerateDemo(session: SandboxSession): Promise<DemoResult> {
  const logs: string[] = []

  const pkgRaw = await readRepoFile(session, 'package.json').catch(() => null)
  if (!pkgRaw) {
    return { demoUrl: null, demoLogs: 'No package.json found — skipped demo.' }
  }

  let pkg: { scripts?: Record<string, string> }
  try {
    pkg = JSON.parse(pkgRaw) as { scripts?: Record<string, string> }
  } catch {
    return { demoUrl: null, demoLogs: 'Invalid package.json — skipped demo.' }
  }

  const scripts = pkg.scripts ?? {}
  const devScript = scripts.dev ?? scripts.start
  if (!devScript) {
    return { demoUrl: null, demoLogs: 'No dev/start script — nothing to preview.' }
  }

  // Install deps only if needed, then boot the dev server. Deliberately lean (no
  // test/build) so the preview fits the task budget. Every step is non-fatal: on
  // failure we return demoUrl=null and the caller still opens the PR.
  const hasModules = await runInRepo(
    session,
    'test -d node_modules && echo yes || echo no',
    15_000
  )
    .then((r) => r.stdout.trim() === 'yes')
    .catch(() => false)

  if (hasModules) {
    logs.push('=== npm install skipped (node_modules already present) ===')
  } else {
    try {
      const install = await runInRepo(
        session,
        'npm install --no-audit --no-fund --progress=false 2>&1 | tail -20',
        300_000
      )
      logs.push('=== npm install ===\n' + (install.stdout || install.stderr || ''))
    } catch (e) {
      logs.push('=== npm install failed/timed out ===\n' + (e instanceof Error ? e.message : String(e)))
      return { demoUrl: null, demoLogs: logs.join('\n\n') }
    }
  }

  const scriptName = scripts.dev ? 'dev' : 'start'
  const devLog = '/tmp/bopple-dev.log'
  logs.push(`=== starting "${scriptName}" server ===`)
  try {
    // Tee the dev server's output to a file so we can report why it failed.
    await session.sandbox.commands.run(`npm run ${scriptName} > ${devLog} 2>&1`, {
      cwd: session.repoPath,
      background: true,
      stdin: false,
      // Nudge frameworks that read PORT toward 3000; others (Vite→5173,
      // Astro→4321, …) pick their own port, which we auto-detect below.
      envs: { PORT: '3000', HOST: '0.0.0.0' },
      timeoutMs: 0,
    })
  } catch (e) {
    logs.push('dev server failed to start: ' + (e instanceof Error ? e.message : String(e)))
    return { demoUrl: null, demoLogs: logs.join('\n\n') }
  }

  // Wait for the server and discover which port it actually bound to — dev servers
  // differ (Next/CRA→3000, Vite→5173, Astro→4321, Vite preview→4173, …). Probe the
  // common ones until one answers. "Connection refused" on all of them means the
  // app crashed on boot (e.g. it needs a database/env the sandbox doesn't have),
  // so we skip the screenshot rather than shoot the sandbox's "port closed" page.
  const detect = [
    'for i in $(seq 1 45); do',
    '  for p in 3000 5173 4321 4173 8080 5000 8000 3001 3002; do',
    '    if curl -sf -o /dev/null "http://localhost:$p"; then echo "BOPPLE_PORT=$p"; exit 0; fi',
    '  done',
    '  sleep 2',
    'done',
  ].join('\n')
  const detected = await runInRepo(session, detect, 110_000)
    .then((r) => r.stdout.match(/BOPPLE_PORT=(\d+)/))
    .catch(() => null)

  if (!detected) {
    const tail = await runInRepo(session, `tail -n 30 ${devLog} 2>/dev/null || true`, 15_000)
      .then((r) => r.stdout.trim())
      .catch(() => '')
    logs.push(
      'Dev server never responded on any common port — no preview captured.' +
        (tail ? `\nLast dev-server output:\n${tail}` : '')
    )
    return { demoUrl: null, demoLogs: logs.join('\n\n') }
  }

  const port = Number(detected[1])
  const demoUrl = session.sandbox.getHost(port)
  logs.push(`Preview: ${demoUrl} (port ${port}, temporary sandbox VM)`)

  return { demoUrl, demoLogs: logs.join('\n\n') }
}

export async function closeSandbox(session: SandboxSession, keepAlive = false) {
  if (!keepAlive) {
    await session.sandbox.kill()
  }
}
