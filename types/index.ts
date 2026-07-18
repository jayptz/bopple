export type TaskStatus = 'queued' | 'running' | 'awaiting_feedback' | 'done' | 'failed'
export type TaskSource = 'telegram' | 'dashboard'
export type UserPlan = 'free' | 'pro' | 'team'

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
  created_at: string
  started_at: string | null
  completed_at: string | null
}

export const MODEL_OPTIONS = [
  { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
  { value: 'gpt-4o', label: 'GPT-4o' },
] as const
