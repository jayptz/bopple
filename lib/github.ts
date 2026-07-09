import { Octokit } from '@octokit/rest'

export function getOctokit(token: string) {
  return new Octokit({ auth: token })
}

export async function getUserRepos(token: string) {
  const octokit = getOctokit(token)
  const { data } = await octokit.repos.listForAuthenticatedUser({
    sort: 'updated',
    per_page: 50,
    affiliation: 'owner',
  })
  return data
}

export async function getRepoContext(
  token: string,
  repoFullName: string,
  maxFiles = 30
): Promise<string> {
  const octokit = getOctokit(token)
  const [owner, repo] = repoFullName.split('/')

  const { data: repoData } = await octokit.repos.get({ owner, repo })
  const { data: ref } = await octokit.git.getRef({
    owner,
    repo,
    ref: `heads/${repoData.default_branch}`,
  })

  const { data: tree } = await octokit.git.getTree({
    owner,
    repo,
    tree_sha: ref.object.sha,
    recursive: '1',
  })
  const files = tree.tree
    .filter(
      (f) =>
        f.type === 'blob' &&
        f.path &&
        !f.path.includes('node_modules') &&
        !f.path.includes('.next')
    )
    .slice(0, maxFiles)

  const priorityFiles = files
    .filter((f) =>
      f.path?.match(/^(package\.json|README\.md|src\/index|app\/layout|pages\/_app)/)
    )
    .slice(0, 5)

  let context = `Repository: ${repoFullName}\n\nFile structure:\n`
  context += files.map((f) => f.path).join('\n')
  context += '\n\n'

  for (const file of priorityFiles) {
    try {
      const { data } = await octokit.repos.getContent({
        owner,
        repo,
        path: file.path!,
      })
      if ('content' in data) {
        const content = Buffer.from(data.content, 'base64').toString('utf8')
        context += `\n--- ${file.path} ---\n${content.slice(0, 2000)}\n`
      }
    } catch {
      // Skip unreadable files
    }
  }

  return context
}

export async function createBranch(
  token: string,
  repoFullName: string,
  branchName: string,
  baseBranch = 'main'
) {
  const octokit = getOctokit(token)
  const [owner, repo] = repoFullName.split('/')

  const { data: ref } = await octokit.git.getRef({
    owner,
    repo,
    ref: `heads/${baseBranch}`,
  })
  await octokit.git.createRef({
    owner,
    repo,
    ref: `refs/heads/${branchName}`,
    sha: ref.object.sha,
  })
}

export async function commitFiles(
  token: string,
  repoFullName: string,
  branchName: string,
  files: { path: string; content: string }[],
  message: string
) {
  const octokit = getOctokit(token)
  const [owner, repo] = repoFullName.split('/')

  const { data: ref } = await octokit.git.getRef({
    owner,
    repo,
    ref: `heads/${branchName}`,
  })
  const { data: commit } = await octokit.git.getCommit({
    owner,
    repo,
    commit_sha: ref.object.sha,
  })

  const blobs = await Promise.all(
    files.map(async (file) => {
      const { data } = await octokit.git.createBlob({
        owner,
        repo,
        content: Buffer.from(file.content).toString('base64'),
        encoding: 'base64',
      })
      return { path: file.path, sha: data.sha }
    })
  )

  const { data: tree } = await octokit.git.createTree({
    owner,
    repo,
    base_tree: commit.tree.sha,
    tree: blobs.map((b) => ({
      path: b.path,
      mode: '100644' as const,
      type: 'blob' as const,
      sha: b.sha,
    })),
  })

  const { data: newCommit } = await octokit.git.createCommit({
    owner,
    repo,
    message,
    tree: tree.sha,
    parents: [ref.object.sha],
  })

  await octokit.git.updateRef({
    owner,
    repo,
    ref: `heads/${branchName}`,
    sha: newCommit.sha,
  })
}

export async function openPullRequest(
  token: string,
  repoFullName: string,
  branchName: string,
  title: string,
  body: string,
  baseBranch = 'main'
) {
  const octokit = getOctokit(token)
  const [owner, repo] = repoFullName.split('/')

  const { data } = await octokit.pulls.create({
    owner,
    repo,
    title,
    body,
    head: branchName,
    base: baseBranch,
    draft: false,
  })

  return { url: data.html_url, number: data.number }
}

export async function getDefaultBranch(token: string, repoFullName: string): Promise<string> {
  const octokit = getOctokit(token)
  const [owner, repo] = repoFullName.split('/')
  const { data } = await octokit.repos.get({ owner, repo })
  return data.default_branch
}
