export type TaskStatus = 'queued' | 'running' | 'awaiting_feedback' | 'done' | 'failed'
export type TaskSource = 'telegram' | 'dashboard'
export type UserPlan = 'free' | 'pro' | 'team'

export type AgentLogType =
  | 'thinking'
  | 'reading'
  | 'writing'
  | 'running'
  | 'committing'
  | 'done'

export interface AgentLogEntry {
  timestamp: string
  type: AgentLogType
  message: string
}

export interface User {
  id: string
  github_id: string
  github_username: string
  github_access_token: string | null
  github_avatar_url: string | null
  telegram_chat_id: string | null
  telegram_connect_token: string | null
  anthropic_api_key: string | null
  openai_api_key: string | null
  preferred_model: string
  plan: UserPlan
  tasks_used_this_month: number
  tasks_limit: number
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  created_at: string
  updated_at: string
}

export interface Repo {
  id: string
  user_id: string
  github_repo_id: number
  name: string
  full_name: string
  default_branch: string
  is_private: boolean
  is_active: boolean
  created_at: string
}

export interface Task {
  id: string
  user_id: string | null
  repo_id: string | null
  repo_full_name: string | null
  prompt: string
  status: TaskStatus
  branch_name: string | null
  pr_url: string | null
  pr_number: number | null
  pr_title: string | null
  files_changed: number | null
  lines_added: number | null
  lines_removed: number | null
  error_message: string | null
  source: TaskSource
  telegram_chat_id: string | null
  trigger_run_id: string | null
  model_used: string | null
  tokens_used: number | null
  sandbox_id: string | null
  conversation: { role: 'user' | 'assistant'; content: string }[] | null
  demo_url: string | null
  demo_logs: string | null
  diff_text: string | null
  screenshot_url: string | null
  /** Base64-encoded reference image from Telegram (no data-URL prefix). */
  reference_image_base64: string | null
  agent_logs: AgentLogEntry[] | null
  feedback_history: FeedbackEntry[] | null
  telegram_message_ids: number[] | null
  created_at: string
  started_at: string | null
  completed_at: string | null
}

export interface FeedbackEntry {
  timestamp: string
  message: string
}

export const MODEL_OPTIONS = [
  { value: 'claude-sonnet-5', label: 'Claude Sonnet 5' },
  { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
  { value: 'claude-opus-4-8', label: 'Claude Opus 4.8' },
  { value: 'claude-opus-4-7', label: 'Claude Opus 4.7' },
  { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
  { value: 'gpt-4o', label: 'GPT-4o' },
] as const

export const DEFAULT_MODEL = MODEL_OPTIONS[0].value

export const AGENT_LOG_ICONS: Record<AgentLogType, string> = {
  thinking: '🤔',
  reading: '📖',
  writing: '✏️',
  running: '⚡',
  committing: '📦',
  done: '✅',
}
