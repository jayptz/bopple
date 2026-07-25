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
 * Words that often appear after on/in/for or as bare English — never treat
 * these as repo short names even if a connected repo is literally named that.
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

/** Determiners skipped between on/in/for and the name ("on my yaj-ai repo"). */
const REPO_HINT_DETERMINERS = new Set(['my', 'the', 'our', 'a', 'an', 'your', 'their'])

/**
 * Normalized short names shorter than this are never matched as bare tokens
 * (too many English collisions).
 */
const MIN_SHORT_NAME_MATCH_LEN = 3

export const ACTIVE_TASK_STATUSES = ['queued', 'running', 'awaiting_feedback'] as const

export type RepoResolveResult =
  | { status: 'matched'; repo: ConnectedRepo }
  /** No connected repo was clearly referenced in the message. */
  | { status: 'none' }
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
      detectedRepo: string
      /** Always set — new tasks require an unambiguous matched repo. */
      repo: ConnectedRepo
    }
  | { action: 'ask_ambiguous'; repos: ConnectedRepo[]; reason: string }
  | { action: 'unknown_repo'; name: string; reason: string }
  | {
      action: 'no_repo_match'
      reason: string
      /** Connected repos considered (for user-facing list + logs). */
      connected: ConnectedRepo[]
    }

export function shortRepoName(fullName: string): string {
  const parts = fullName.split('/')
  return (parts[parts.length - 1] ?? fullName).toLowerCase()
}

/**
 * Strip all non-alphanumeric characters and lowercase.
 * "Yaj.AI" / "yaj-ai" / "YajAI" / "yaj ai" → "yajai"
 * "CP317-SoftEng" → "cp317softeng"
 */
export function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

/** @deprecated Use {@link normalize} — kept as an alias for existing imports. */
export const normalizeRepoToken = normalize

/** Alphanumeric runs in the message (punctuation/spacing become token boundaries). */
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

/**
 * Resolve which connected repo a natural-language message refers to.
 * Matching is always on {@link normalize}'d short names (and full_name as fallback).
 * Longer normalized names win the sort so "essentialoilswebsite" beats "oils".
 */
export function resolveRepoFromMessage(
  message: string,
  connected: ConnectedRepo[]
): RepoResolveResult {
  if (connected.length === 0) return { status: 'none' }

  const tokens = messageAlnumTokens(message)

  // Prefer longer *normalized* names first so "my-app-web" wins over "web".
  const byName = [...connected].sort(
    (a, b) =>
      normalize(shortRepoName(b.full_name)).length -
      normalize(shortRepoName(a.full_name)).length
  )

  const matched: ConnectedRepo[] = []
  const seenIds = new Set<string>()

  for (const repo of byName) {
    const short = shortRepoName(repo.full_name)
    const shortNorm = normalize(short)
    const nameNorm = normalize(repo.name || '')
    const fullNorm = normalize(repo.full_name)

    const shortOk =
      shortNorm.length >= MIN_SHORT_NAME_MATCH_LEN && !REPO_HINT_STOPWORDS.has(shortNorm)
    const nameOk =
      nameNorm.length >= MIN_SHORT_NAME_MATCH_LEN &&
      !REPO_HINT_STOPWORDS.has(nameNorm) &&
      nameNorm !== shortNorm

    const hit =
      (shortOk && normalizedSequenceMatch(shortNorm, tokens)) ||
      (nameOk && normalizedSequenceMatch(nameNorm, tokens)) ||
      normalizedSequenceMatch(fullNorm, tokens)

    if (hit && !seenIds.has(repo.id)) {
      seenIds.add(repo.id)
      matched.push(repo)
    }
  }

  if (matched.length === 1) return { status: 'matched', repo: matched[0] }
  if (matched.length > 1) return { status: 'ambiguous', repos: matched }

  // No connected repo matched — surface explicit "on/in/for <name>" typos.
  const lower = message.toLowerCase()
  const hintRe =
    /\b(?:on|in|for)\s+(?:(?:my|the|our|a|an|your|their)\s+)?([a-z0-9][a-z0-9._-]*)\b/gi
  const connectedNorms = new Set(
    connected.map((r) => normalize(shortRepoName(r.full_name)))
  )

  let hintMatch: RegExpExecArray | null
  while ((hintMatch = hintRe.exec(lower)) !== null) {
    const name = hintMatch[1]
    if (REPO_HINT_STOPWORDS.has(name) || REPO_HINT_DETERMINERS.has(name)) continue
    const hintNorm = normalize(name)
    if (REPO_HINT_STOPWORDS.has(hintNorm)) continue
    if (connectedNorms.has(hintNorm)) continue
    return { status: 'unknown', name }
  }

  return { status: 'none' }
}

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
  /** True when the user sent /reply (with or without trailing text). */
  explicitReply: boolean
  resolved: RepoResolveResult
  /**
   * Task to continue when the user replied to a bot message and/or sent /reply.
   * Null when neither signal is present.
   */
  continuationTask: ContinuableTaskRef | null
  /** Full connected list — attached to no_repo_match for logging / UX. */
  connected: ConnectedRepo[]
}): TelegramRouteDecision {
  const { forceNew, explicitReply, resolved, continuationTask, connected } = params

  // continuationTask is only set by the webhook when reply-to or /reply was present.
  // Explicit continuation does not require re-naming the repo.
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

  // status === 'none' — do not invent a repo (no repos[0], no active-task fallback).
  return {
    action: 'no_repo_match',
    reason: forceNew ? 'force_new_no_repo_match' : 'no_repo_referenced',
    connected,
  }
}

export function formatResolveLog(
  resolved: RepoResolveResult,
  connected: ConnectedRepo[]
): string {
  const considered = connected
    .map((r) => `${r.full_name}(norm=${normalize(shortRepoName(r.full_name))})`)
    .join(',')
  switch (resolved.status) {
    case 'matched':
      return `[telegram] repo_resolve status=matched repo=${resolved.repo.full_name} considered=${considered}`
    case 'ambiguous':
      return `[telegram] repo_resolve status=ambiguous repos=${resolved.repos.map((r) => r.full_name).join('|')} considered=${considered}`
    case 'unknown':
      return `[telegram] repo_resolve status=unknown name=${resolved.name} considered=${considered}`
    case 'none':
      return `[telegram] repo_resolve status=none considered=${considered}`
  }
}

export function formatRouteLog(decision: TelegramRouteDecision): string {
  switch (decision.action) {
    case 'feedback':
      return `[telegram] path=feedback reason=${decision.reason} detectedRepo=${decision.detectedRepo ?? '(none)'} taskRepo=${decision.taskRepo ?? '(none)'} taskId=${decision.taskId}`
    case 'new_task':
      return `[telegram] path=new_task reason=${decision.reason} detectedRepo=${decision.detectedRepo} createOn=${decision.repo.full_name}`
    case 'ask_ambiguous':
      return `[telegram] path=ask_ambiguous reason=${decision.reason} repos=${decision.repos.map((r) => r.full_name).join(',')}`
    case 'unknown_repo':
      return `[telegram] path=unknown_repo reason=${decision.reason} name=${decision.name}`
    case 'no_repo_match':
      return `[telegram] path=no_repo_match reason=${decision.reason} connected=${decision.connected.map((r) => r.full_name).join(',')}`
  }
}

/** Short names for "not found" replies (capped). */
export function formatConnectedRepoList(connected: ConnectedRepo[], limit = 12): string {
  const names = connected.map((r) => shortRepoName(r.full_name))
  if (names.length === 0) return '(none)'
  if (names.length <= limit) return names.join(', ')
  const shown = names.slice(0, limit).join(', ')
  return `${shown}, and ${names.length - limit} more`
}
