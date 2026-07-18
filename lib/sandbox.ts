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
  if (existingSandboxId) {
    try {
      const sandbox = await Sandbox.connect(existingSandboxId, { timeoutMs: 600_000 })
      return { sandbox, repoPath: REPO_PATH }
    } catch {
      // Sandbox expired or not found, create a new one
    }
  }
  
  const sandbox = await Sandbox.create({ timeoutMs: 600_000 })
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

export async function commitAndPush(
  session: SandboxSession,
  githubToken: string,
  message: string,
  branchName: string,
  repoFullName: string
) {
  const status = await runInRepo(session, 'git status --porcelain', 30_000)
  if (!status.stdout.trim()) {
    return { pushed: false, filesChanged: 0 }
  }

  const escapedMessage = message.replace(/"/g, '\\"')
  const remote = authCloneUrl(repoFullName, githubToken)

  await runInRepo(
    session,
    `git add -A && git commit -m "${escapedMessage}" && git push ${remote} ${branchName}`,
    180_000
  )

  const fileCount = status.stdout.trim().split('\n').filter(Boolean).length
  return { pushed: true, filesChanged: fileCount }
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

  if (scripts.test) {
    logs.push('=== npm test ===')
    const test = await runInRepo(session, 'npm test 2>&1 | tail -40', 180_000)
    logs.push(test.stdout || test.stderr || '(no output)')
  }

  if (scripts.build) {
    logs.push('=== npm run build ===')
    const build = await runInRepo(session, 'npm run build 2>&1 | tail -40', 180_000)
    logs.push(build.stdout || build.stderr || '(no output)')
  }

  const devScript = scripts.dev ?? scripts.start
  if (!devScript) {
    return { demoUrl: null, demoLogs: logs.join('\n\n') || 'No dev script found.' }
  }

  const install = await runInRepo(session, 'npm install 2>&1 | tail -20', 180_000)
  logs.push('=== npm install ===\n' + (install.stdout || install.stderr || ''))

  const port = 3000
  logs.push(`=== starting dev server on :${port} ===`)

  const scriptName = scripts.dev ? 'dev' : 'start'
  await session.sandbox.commands.run(`npm run ${scriptName}`, {
    cwd: session.repoPath,
    background: true,
    stdin: false,
    envs: { PORT: String(port), HOST: '0.0.0.0' },
    timeoutMs: 0,
  })

  await new Promise((resolve) => setTimeout(resolve, 8000))

  const demoUrl = session.sandbox.getHost(port)
  logs.push(`Preview: ${demoUrl} (temporary sandbox VM)`)

  return { demoUrl, demoLogs: logs.join('\n\n') }
}

export async function closeSandbox(session: SandboxSession, keepAlive = false) {
  if (!keepAlive) {
    await session.sandbox.kill()
  }
}
