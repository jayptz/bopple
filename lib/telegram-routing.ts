/**
 * Telegram message → task routing helpers.
 * Keeps repo parsing and feedback-vs-new-task decisions in one place.
 */

export type ConnectedRepo = {
  id: string
  full_name: string
  name: string
}

/**
 * Words that often follow on/in/for but are not repo names.
 * Also excluded from whole-word short-name matching so common English
 * ("for now", "on the …") never collides with a short repo name.
 */
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
  'now',
  'once',
  'just',
  'later',
  'today',
  'tomorrow',
  'please',
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

/** Determiners skipped between on/in/for and the name ("on my Yaj.AI repo"). */
const REPO_HINT_DETERMINERS = new Set(['my', 'the', 'our', 'a', 'an', 'your', 'their'])

/**
 * Short names shorter than this are only matched via full owner/name,
 * never as bare whole words (too many English collisions).
 */
const MIN_SHORT_NAME_MATCH_LEN = 3

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

/** Normalize for fuzzy compare: "Yaj.AI" / "yaj-ai" / "YajAI" → "yajai". */
export function normalizeRepoToken(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Whole-token match. Dots/hyphens in the name are literal; surrounding
 * punctuation (including other dots) counts as a boundary so "yaj.ai"
 * matches inside "On my Yaj.AI repo".
 */
function tokenMatchesMessage(token: string, messageLower: string): boolean {
  if (!token) return false
  const escaped = escapeRegExp(token)
  const wholeWord = new RegExp(`(?:^|[^a-z0-9_])${escaped}(?:[^a-z0-9_]|$)`, 'i')
  if (wholeWord.test(messageLower)) return true

  // Only for dotted/hyphenated names (e.g. Yaj.AI): also match punctuation-stripped
  // form as a whole token so "YajAI" / "yaj ai" still resolve.
  if (!/[.\-_]/.test(token)) return false
  const compact = normalizeRepoToken(token)
  if (compact.length < MIN_SHORT_NAME_MATCH_LEN) return false
  if (REPO_HINT_STOPWORDS.has(token) || REPO_HINT_STOPWORDS.has(compact)) return false

  const softened = messageLower.replace(/[^a-z0-9]+/g, ' ')
  const compactWhole = new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(compact)}(?:[^a-z0-9]|$)`, 'i')
  return compactWhole.test(softened)
}

/**
 * Resolve which connected repo a natural-language Telegram message refers to.
 * Matches short names (e.g. "bopple" from "jayptz/bopple") as whole words.
 * Names with periods (e.g. "Yaj.AI") are preserved and also matched without punctuation.
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

    // Skip stopword / tiny short names for bare whole-word match (still allow full owner/repo).
    const shortAllowed =
      short.length >= MIN_SHORT_NAME_MATCH_LEN && !REPO_HINT_STOPWORDS.has(short)

    const nameField = (repo.name || '').toLowerCase()
    const nameAllowed =
      nameField.length >= MIN_SHORT_NAME_MATCH_LEN && !REPO_HINT_STOPWORDS.has(nameField)

    const hit =
      (shortAllowed && tokenMatchesMessage(short, lower)) ||
      (nameAllowed && nameField !== short && tokenMatchesMessage(nameField, lower)) ||
      tokenMatchesMessage(repo.full_name.toLowerCase(), lower)

    if (hit && !seenIds.has(repo.id)) {
      seenIds.add(repo.id)
      matched.push(repo)
    }
  }

  if (matched.length === 1) return { status: 'matched', repo: matched[0] }
  if (matched.length > 1) return { status: 'ambiguous', repos: matched }

  // No connected repo found — check explicit "on/in/for <name>" hints for typos.
  // Allow an optional determiner so "on my Yaj.AI repo" yields "yaj.ai", not "my".
  const hintRe =
    /\b(?:on|in|for)\s+(?:(?:my|the|our|a|an|your|their)\s+)?([a-z0-9][a-z0-9._-]*)\b/gi
  const hints: string[] = []
  let hintMatch: RegExpExecArray | null
  while ((hintMatch = hintRe.exec(lower)) !== null) {
    const name = hintMatch[1]
    if (REPO_HINT_STOPWORDS.has(name) || REPO_HINT_DETERMINERS.has(name)) continue
    hints.push(name)
  }

  const connectedShort = new Set(connected.map((r) => shortRepoName(r.full_name)))
  const connectedCompact = new Set(
    connected.map((r) => normalizeRepoToken(shortRepoName(r.full_name)))
  )

  for (const hint of hints) {
    if (connectedShort.has(hint)) continue
    if (connectedCompact.has(normalizeRepoToken(hint))) continue
    return { status: 'unknown', name: hint }
  }

  return { status: 'default' }
}

/**
 * Decide feedback-on-existing-task vs create-new-task.
 *
 * Default: every message creates a NEW task.
 * Continue an existing task only with an explicit signal:
 *   - Telegram reply-to on that task's Done/update message, or
 *   - `/reply` (targets reply-to if present, else most recent active task).
 * Repo matching only picks which repo a NEW task targets — never feedback-vs-new.
 */
export function decideTelegramRoute(params: {
  forceNew: boolean
  /** True when the user sent /reply (with or without trailing text). */
  explicitReply: boolean
  resolved: RepoResolveResult
  /**
   * Task to continue when the user replied to a bot message and/or sent /reply.
   * Null when neither signal is present — always new_task in that case.
   */
  continuationTask: ContinuableTaskRef | null
}): TelegramRouteDecision {
  const { forceNew, explicitReply, resolved, continuationTask } = params

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

  // continuationTask is only set by the webhook when reply-to or /reply was present.
  if (continuationTask) {
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

  // No reply-to / /reply → always a new task. Repo only selects the target.
  if (resolved.status === 'matched') {
    return {
      action: 'new_task',
      reason: 'new_task_with_matched_repo',
      detectedRepo: resolved.repo.full_name,
      repo: resolved.repo,
    }
  }

  return {
    action: 'new_task',
    reason: 'new_task_default_repo',
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
