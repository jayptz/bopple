# Bopple

Text a task. Get a PR. Go live your life.

[Watch the demo](./bopple-demo2.mp4)

Demo of Bopple taking a Telegram task through to a pull request. [Technical writeup](https://jayptz.me/blogs/bopple).

Bopple is an async coding agent you control from your phone. Send a prompt from Telegram while you're out — Bopple writes the code, opens a pull request, and pings you when it's ready. Nothing ever touches main without your approval.

---

## How it works

```
You text a task from Telegram
        ↓
Bopple clones your repo in a cloud VM
        ↓
Claude writes the code on a new branch
        ↓
PR opens on GitHub automatically
        ↓
You get a notification with the PR link + live preview
        ↓
You review and merge — or don't
```

---

## Why Bopple

Every other async coding agent expects you to change how you work.

Cursor requires their IDE. Jules requires GitHub issues. Devin lives in Slack. Codex lives in ChatGPT.

Bopple runs in Telegram — an app you already have on your phone. No new subscriptions, no IDE switch, no ecosystem lock-in.

---

## Features

- Telegram-native input — text a task like you'd text a person
- Cloud VM per task — isolated environment, runs your code, never touches your laptop
- Auto PR — every task opens a GitHub pull request on a new branch
- Live preview — see the running app before you merge
- BYOK — bring your own Anthropic or OpenAI key, pay nothing to Bopple
- Works with any IDE — VS Code, Cursor, JetBrains, Neovim, whatever
- Mobile dashboard — real-time task feed, diffs, and status
- Async by design — fire a task, close your phone, come back to a PR

---

## Quickstart

**1. Sign in with GitHub**

One click. Bopple connects to your repos via GitHub OAuth — no config files, no manual setup.

**2. Connect Telegram**

Message `@BoppleSBot` and link it to your account. That's your entire interface.

**3. Add your API key**

Paste your Anthropic or OpenAI API key in settings. You pay the model provider directly.

**4. Send your first task**

```
You → @BoppleSBot:
"add input validation to the signup form"

Bopple → 6 min later:
"✅ Done — PR #47 open on feat/signup-validation
 3 files changed, +89 lines
 Review → github.com/you/repo/pull/47
 Preview → https://preview.bopple.dev/abc123"
```

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js + Tailwind, Vercel |
| Auth + DB | Supabase (GitHub OAuth, encrypted key storage) |
| GitHub | Octokit + GitHub REST API |
| AI | Anthropic SDK + OpenAI SDK |
| Sandbox | E2B (isolated cloud VMs, 4GB RAM) |
| Jobs | Trigger.dev |
| Messenger | Telegram Bot API |
| Payments | Stripe |

---

## Roadmap

- [x] GitHub OAuth + repo indexing
- [x] Telegram bot interface
- [x] Cloud VM sandbox (E2B)
- [x] Branch creation + PR opening
- [x] Live preview URL
- [x] Mobile dashboard
- [x] BYOK key management
- [ ] Stripe billing
- [ ] Voice prompt support
- [ ] WhatsApp support
- [ ] Team dashboard

---

## Contributing

Built by [@jayptz](https://github.com/jayptz), [@Dhruvilp25](https://github.com/Dhruvilp25), and [@Vrundaa22](https://github.com/Vrundaa22).

MIT License.
