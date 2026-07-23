/**
 * Telegram message → task routing helpers.
 * Keeps repo parsing and feedback-vs-new-task decisions in one place.
 */

export type ConnectedRepo = {
  id: string
  full_name: string
  name: string
}

/** Words that often follow on/in/for but are not repo names. */
const REPO_HINT_STOPWORDS = new Set([
  'the',
  'a',
  'an',
  'my',
  'your',
  'our',
  'their',
  'this',
  'that',
  'these',
  'those',
  'it',
  'me',
  'us',
  'code',
  'codebase',
  'repo',
  'repository',
  'project',
  'app',
  'file',
  'files',
  'folder',
  'page',
  'pages',
  'website',
  'readme',
  'pr',
  'branch',
  'main',
  'master',
  'here',
  'there',
  'general',
  'production',
  'staging',
  'dashboard',
  'settings',
])

export const ACTIVE_TASK_STATUSES = ['queued', 'running', 'awaiting_feedback'] as const

export type RepoResolveResult =
  | { status: 'matched'; repo: ConnectedRepo }
  | { status: 'default' }
  | { status: 'ambiguous'; repos: ConnectedRepo[] }
  | { status: 'unknown'; name: string }

export type ContinuableTaskRef = {
  id: string
  repo_full_name: string | null
  status: string
}

export type TelegramRouteDecision =
  | {
      action: 'feedback'
      taskId: string
      reason: string
      detectedRepo: string | null
      taskRepo: string | null
    }
  | {
      action: 'new_task'
      reason: string
      detectedRepo: string | null
      /** When status was matched, the repo to create on. */
      repo: ConnectedRepo | null
    }
  | { action: 'ask_ambiguous'; repos: ConnectedRepo[]; reason: string }
  | { action: 'unknown_repo'; name: string; reason: string }

export function shortRepoName(fullName: string): string {
  const parts = fullName.split('/')
  return (parts[parts.length - 1] ?? fullName).toLowerCase()
}

/**
 * Resolve which connected repo a natural-language Telegram message refers to.
 * Matches short names (e.g. "bopple" from "jayptz/bopple") as whole words.
 */
export function resolveRepoFromMessage(
  message: string,
  connected: ConnectedRepo[]
): RepoResolveResult {
  if (connected.length === 0) return { status: 'default' }

  const lower = message.toLowerCase()

  // Prefer longer names first so "my-app-web" wins over "web".
  const byName = [...connected].sort(
    (a, b) => shortRepoName(b.full_name).length - shortRepoName(a.full_name).length
  )

  const matched: ConnectedRepo[] = []
  const seenIds = new Set<string>()

  for (const repo of byName) {
    const short = shortRepoName(repo.full_name)
    if (!short) continue

    // Whole-word / boundary-ish match; allow hyphens/underscores/dots in the name.
    const escaped = short.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const wholeWord = new RegExp(`(?:^|[^a-z0-9_])${escaped}(?:[^a-z0-9_]|$)`, 'i')
    const fullEscaped = repo.full_name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const fullName = new RegExp(`(?:^|[^a-z0-9_])${fullEscaped}(?:[^a-z0-9_]|$)`, 'i')

    if (wholeWord.test(lower) || fullName.test(lower)) {
      if (!seenIds.has(repo.id)) {
        seenIds.add(repo.id)
        matched.push(repo)
      }
    }
  }

  if (matched.length === 1) return { status: 'matched', repo: matched[0] }
  if (matched.length > 1) return { status: 'ambiguous', repos: matched }

  // No connected repo found — check explicit "on/in/for <name>" hints for typos.
  const hintRe = /\b(?:on|in|for)\s+([a-z0-9][a-z0-9._-]*)\b/gi
  const hints: string[] = []
  let hintMatch: RegExpExecArray | null
  while ((hintMatch = hintRe.exec(lower)) !== null) {
    const name = hintMatch[1]
    if (!REPO_HINT_STOPWORDS.has(name)) hints.push(name)
  }

  const connectedShort = new Set(connected.map((r) => shortRepoName(r.full_name)))
  for (const hint of hints) {
    if (!connectedShort.has(hint)) {
      return { status: 'unknown', name: hint }
    }
  }

  return { status: 'default' }
}

/**
 * Decide feedback-on-existing-task vs create-new-task.
 *
 * Repo mentioned + matches active task on that repo → feedback.
 * Repo mentioned + no active task on that repo (or mismatch) → new task.
 * No repo mentioned → feedback on the open/global continuable task if any.
 */
export function decideTelegramRoute(params: {
  forceNew: boolean
  resolved: RepoResolveResult
  /** Most recent active task for the matched repo (only when resolved.status === 'matched'). */
  activeTaskForMatchedRepo: ContinuableTaskRef | null
  /** Continuable task when no repo was named (reply / awaiting_feedback fallback). */
  openTaskNoRepo: ContinuableTaskRef | null
}): TelegramRouteDecision {
  const { forceNew, resolved, activeTaskForMatchedRepo, openTaskNoRepo } = params

  if (forceNew) {
    if (resolved.status === 'ambiguous') {
      return {
        action: 'ask_ambiguous',
        repos: resolved.repos,
        reason: 'force_new_ambiguous_repo',
      }
    }
    if (resolved.status === 'unknown') {
      return {
        action: 'unknown_repo',
        name: resolved.name,
        reason: 'force_new_unknown_repo',
      }
    }
    return {
      action: 'new_task',
      reason: 'force_new',
      detectedRepo: resolved.status === 'matched' ? resolved.repo.full_name : null,
      repo: resolved.status === 'matched' ? resolved.repo : null,
    }
  }

  if (resolved.status === 'ambiguous') {
    return {
      action: 'ask_ambiguous',
      repos: resolved.repos,
      reason: 'ambiguous_repo_in_message',
    }
  }

  if (resolved.status === 'unknown') {
    return {
      action: 'unknown_repo',
      name: resolved.name,
      reason: 'unknown_repo_in_message',
    }
  }

  if (resolved.status === 'matched') {
    const detected = resolved.repo.full_name
    if (
      activeTaskForMatchedRepo &&
      activeTaskForMatchedRepo.repo_full_name === detected
    ) {
      return {
        action: 'feedback',
        taskId: activeTaskForMatchedRepo.id,
        reason: 'repo_matches_active_task',
        detectedRepo: detected,
        taskRepo: activeTaskForMatchedRepo.repo_full_name,
      }
    }
    return {
      action: 'new_task',
      reason: activeTaskForMatchedRepo
        ? 'repo_mismatch_create_new'
        : 'repo_mentioned_no_active_task_on_repo',
      detectedRepo: detected,
      repo: resolved.repo,
    }
  }

  // No repo detected — keep prior behavior: continue open task if any.
  if (openTaskNoRepo) {
    return {
      action: 'feedback',
      taskId: openTaskNoRepo.id,
      reason: 'no_repo_in_message_continue_open_task',
      detectedRepo: null,
      taskRepo: openTaskNoRepo.repo_full_name,
    }
  }

  return {
    action: 'new_task',
    reason: 'no_repo_in_message_no_open_task',
    detectedRepo: null,
    repo: null,
  }
}

export function formatRouteLog(decision: TelegramRouteDecision): string {
  switch (decision.action) {
    case 'feedback':
      return `[telegram] path=feedback reason=${decision.reason} detectedRepo=${decision.detectedRepo ?? '(none)'} taskRepo=${decision.taskRepo ?? '(none)'} taskId=${decision.taskId}`
    case 'new_task':
      return `[telegram] path=new_task reason=${decision.reason} detectedRepo=${decision.detectedRepo ?? '(none)'} createOn=${decision.repo?.full_name ?? '(default)'}`
    case 'ask_ambiguous':
      return `[telegram] path=ask_ambiguous reason=${decision.reason} repos=${decision.repos.map((r) => r.full_name).join(',')}`
    case 'unknown_repo':
      return `[telegram] path=unknown_repo reason=${decision.reason} name=${decision.name}`
  }
}
