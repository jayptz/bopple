import { Sandbox } from 'e2b'

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

export async function createSandboxSession(existingSandboxId?: string | null): Promise<SandboxSession> {
  let sandbox: Sandbox | null = null

  // Try to resume the stored sandbox, but fall back to a fresh one if it's gone.
  // Paused sandboxes expire and failed runs kill theirs, so a stale sandbox_id
  // must not be fatal — the work lives on the git branch, which we re-clone.
  if (existingSandboxId) {
    try {
      sandbox = await Sandbox.connect(existingSandboxId, { timeoutMs: 600_000 })
    } catch {
      sandbox = null
    }
  }

  if (!sandbox) {
    sandbox = await Sandbox.create({ timeoutMs: 600_000 })
  }

  return { sandbox, repoPath: REPO_PATH }
}

async function gitConfig(session: SandboxSession) {
  await runInRepo(
    session,
    `git config --global user.name "${GIT_USER}" && git config --global user.email "${GIT_EMAIL}"`,
    30_000
  )
}

export async function cloneRepository(
  session: SandboxSession,
  repoFullName: string,
  githubToken: string,
  defaultBranch: string,
  branchName?: string | null
) {
  const cloneUrl = authCloneUrl(repoFullName, githubToken)

  if (branchName) {
    await session.sandbox.commands.run(
      `rm -rf ${REPO_PATH} && git clone --depth 1 --branch ${branchName} ${cloneUrl} ${REPO_PATH}`,
      { timeoutMs: 180_000, stdin: false }
    )
  } else {
    await session.sandbox.commands.run(
      `rm -rf ${REPO_PATH} && git clone --depth 1 --branch ${defaultBranch} ${cloneUrl} ${REPO_PATH}`,
      { timeoutMs: 180_000, stdin: false }
    )
  }

  await gitConfig(session)
}

export async function createWorkBranch(session: SandboxSession, branchName: string) {
  await runInRepo(session, `git checkout -b ${branchName}`, 30_000)
}

export async function runInRepo(session: SandboxSession, command: string, timeoutMs = COMMAND_TIMEOUT_MS) {
  const result = await session.sandbox.commands.run(command, {
    cwd: session.repoPath,
    timeoutMs,
    stdin: false,
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

export async function writeRepoFile(session: SandboxSession, relativePath: string, content: string) {
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

const MAX_DIFF_CHARS = 100_000

export interface CommitResult {
  pushed: boolean
  filesChanged: number
  linesAdded: number
  linesRemoved: number
  diff: string
}

export async function commitAndPush(
  session: SandboxSession,
  githubToken: string,
  message: string,
  branchName: string,
  repoFullName: string
): Promise<CommitResult> {
  const status = await runInRepo(session, 'git status --porcelain', 30_000)
  if (!status.stdout.trim()) {
    return { pushed: false, filesChanged: 0, linesAdded: 0, linesRemoved: 0, diff: '' }
  }

  // Stage everything first so new/deleted files show up in numstat and the diff.
  await runInRepo(session, 'git add -A', 30_000)

  const numstat = await runInRepo(session, 'git diff --cached --numstat', 30_000)
  let linesAdded = 0
  let linesRemoved = 0
  for (const line of numstat.stdout.trim().split('\n').filter(Boolean)) {
    const [added, removed] = line.split('\t')
    // Binary files report "-" instead of a count; skip those.
    if (added !== '-') linesAdded += parseInt(added, 10) || 0
    if (removed !== '-') linesRemoved += parseInt(removed, 10) || 0
  }

  const diffResult = await runInRepo(session, 'git diff --cached', 60_000)
  const diff = diffResult.stdout.slice(0, MAX_DIFF_CHARS)

  const escapedMessage = message.replace(/"/g, '\\"')
  const remote = authCloneUrl(repoFullName, githubToken)

  await runInRepo(
    session,
    `git commit -m "${escapedMessage}" && git push ${remote} ${branchName}`,
    180_000
  )

  const fileCount = status.stdout.trim().split('\n').filter(Boolean).length
  return { pushed: true, filesChanged: fileCount, linesAdded, linesRemoved, diff }
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
