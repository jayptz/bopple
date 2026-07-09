'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { MODEL_OPTIONS } from '@/types'
import type { User } from '@/types'

export default function SettingsPage() {
  const [profile, setProfile] = useState<Partial<User> | null>(null)
  const [anthropicKey, setAnthropicKey] = useState('')
  const [openaiKey, setOpenaiKey] = useState('')
  const [model, setModel] = useState('claude-sonnet-4-20250514')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [connectToken, setConnectToken] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const res = await fetch('/api/settings')
      if (res.ok) {
        const data = (await res.json()) as { user: User; connectToken: string }
        setProfile(data.user)
        setModel(data.user.preferred_model)
        setConnectToken(data.connectToken)
      }
    }
    load()
  }, [])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setMessage(null)

    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          anthropic_api_key: anthropicKey || undefined,
          openai_api_key: openaiKey || undefined,
          preferred_model: model,
        }),
      })

      if (!res.ok) {
        const data = (await res.json()) as { error?: string }
        throw new Error(data.error ?? 'Failed to save')
      }

      setAnthropicKey('')
      setOpenaiKey('')
      setMessage('Settings saved')
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function handleUpgrade() {
    const res = await fetch('/api/billing/checkout', { method: 'POST' })
    if (res.ok) {
      const data = (await res.json()) as { url: string }
      window.location.href = data.url
    }
  }

  async function handleManageBilling() {
    const res = await fetch('/api/billing/portal', { method: 'POST' })
    if (res.ok) {
      const data = (await res.json()) as { url: string }
      window.location.href = data.url
    }
  }

  function copyToken() {
    if (connectToken) {
      navigator.clipboard.writeText(`/connect ${connectToken}`)
      setMessage('Copied! Paste in @BoppleBot on Telegram.')
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-zinc-100">Settings</h1>
        <p className="text-sm text-zinc-500">API keys, model, Telegram, billing</p>
      </div>

      <section className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <h2 className="text-sm font-medium text-zinc-300">Telegram</h2>
        <p className="text-xs text-zinc-500">
          Message @BoppleBot with this command to link your account:
        </p>
        {connectToken ? (
          <div className="flex gap-2">
            <code className="flex-1 rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2 text-xs font-mono text-emerald-400 truncate">
              /connect {connectToken}
            </code>
            <Button variant="secondary" size="sm" onClick={copyToken}>
              Copy
            </Button>
          </div>
        ) : (
          <p className="text-xs text-zinc-600">Loading...</p>
        )}
        {profile?.telegram_chat_id && (
          <p className="text-xs text-emerald-500">✓ Telegram connected</p>
        )}
      </section>

      <form onSubmit={handleSave} className="space-y-4">
        <section className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <h2 className="text-sm font-medium text-zinc-300">Model</h2>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-emerald-600 focus:outline-none"
          >
            {MODEL_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </section>

        <section className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <h2 className="text-sm font-medium text-zinc-300">API Keys (BYOK)</h2>
          <p className="text-xs text-zinc-500">
            Keys are encrypted before storage. Leave blank to keep existing.
          </p>
          <Input
            label="Anthropic API Key"
            type="password"
            placeholder="sk-ant-..."
            value={anthropicKey}
            onChange={(e) => setAnthropicKey(e.target.value)}
          />
          <Input
            label="OpenAI API Key"
            type="password"
            placeholder="sk-..."
            value={openaiKey}
            onChange={(e) => setOpenaiKey(e.target.value)}
          />
        </section>

        {message && <p className="text-sm text-zinc-400">{message}</p>}

        <Button type="submit" disabled={saving}>
          {saving ? 'Saving...' : 'Save Settings'}
        </Button>
      </form>

      <section className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-medium text-zinc-300">Billing</h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Plan: <span className="text-zinc-300 capitalize">{profile?.plan ?? 'free'}</span>
              {' · '}
              {profile?.tasks_used_this_month ?? 0}/{profile?.tasks_limit ?? 10} tasks this month
            </p>
          </div>
        </div>
        {profile?.plan === 'pro' ? (
          <Button variant="secondary" size="sm" onClick={handleManageBilling}>
            Manage Subscription
          </Button>
        ) : (
          <Button variant="secondary" size="sm" onClick={handleUpgrade}>
            Upgrade to Pro — $15/mo
          </Button>
        )}
      </section>
    </div>
  )
}
