# Bopple

> Text a task. Get a PR. Go live your life.

Bopple is an async coding agent you control from your phone. Send a prompt from Telegram or the dashboard while you're out — Bopple writes the code, opens a pull request, and pings you when it's ready for review. Your codebase never gets touched without your approval.

---

## How it works

```
You text a task from your phone
         ↓
Bopple reads your repo context
         ↓
Claude writes the code on a new branch
         ↓
GitHub PR is opened automatically
         ↓
You get a notification
         ↓
You review and merge — or don't
```

No code ever hits `main` without you. Every task ends in a reviewable PR, not a silent commit.

---

## Why Bopple 

Existing AI coding agents expect you to change how you work.

Cursor requires an IDE.
Jules requires GitHub.
Devin lives in Slack.

Bopple meets developers where they already are.

Text a task.
Review a pull request.
Ship.

## Features

- **Messenger-native** — send tasks via Telegram, no app download required
- **Mobile dashboard** — see every task running, queued, or done in real time
- **Auto PR** — every task opens a GitHub pull request on a new branch
- **BYOK** — bring your own Anthropic or OpenAI API key, pay nothing to Bopple
- **Subscription tier** — skip the key management, just use it
- **Multi-model** — Claude, GPT-4, or Gemini, your choice
- **Repo-aware** — indexes your codebase so context is always included
- **Team-ready** — solo devs, small teams, and larger orgs all supported
- **Async by design** — fire a task, close your phone, come back to a PR

---

## Quickstart

### 1. Sign in with GitHub

One click. Bopple reads your repos via GitHub OAuth — no manual setup, no config files.

### 2. Connect Telegram

Start a chat with `@BoppleBot` and link it to your account. That's your prompt interface.

### 3. Add your API key (or subscribe)

**BYOK (free):** Paste your Anthropic or OpenAI API key in settings. You pay the model provider directly, Bopple charges nothing.

**Pro ($15/month):** Skip the key. Bopple absorbs the API cost with a monthly token allocation included.

### 4. Send your first task

```
You → @BoppleBot:
"add input validation to the signup form, handle empty fields and invalid email format"

Bopple → You (6 min later):
"✅ Done — PR #47 is open on branch feat/signup-validation
 3 files changed, +89 lines
 Ready for review → github.com/you/repo/pull/47"
```

---

## Pricing

| | Free | Pro | Team |
|---|---|---|---|
| Bring your own API key | ✅ | ✅ | ✅ |
| Included token allocation | — | ✅ | ✅ |
| Repos | Unlimited | Unlimited | Unlimited |
| Dashboard | ✅ | ✅ | ✅ |
| Telegram interface | ✅ | ✅ | ✅ |
| Team dashboard | — | — | ✅ |
| Price | $0 | $15/mo | contact |

---

## Stack

| Layer | Technology |
|---|---|
| Frontend / Dashboard | Next.js + Tailwind, hosted on Vercel |
| Auth + Database | Supabase (GitHub OAuth, encrypted key storage) |
| GitHub Integration | Octokit + GitHub REST API |
| AI Layer | Anthropic SDK + OpenAI SDK |
| Async Jobs | Trigger.dev |
| Messenger | Telegram Bot API |
| Payments | Stripe |

---

## Roadmap

- [x] Core concept
- [ ] GitHub OAuth + repo indexing
- [ ] Telegram bot interface
- [ ] Claude + GPT multi-model support
- [ ] Branch creation + PR opening
- [ ] Mobile dashboard (task feed, diffs, status)
- [ ] Push notifications
- [ ] BYOK key management
- [ ] Stripe billing
- [ ] WhatsApp support
- [ ] Voice prompt support
- [ ] Team tier + shared dashboard

---

## Beta

Bopple is currently in private beta. 10 free tasks, no credit card required.

**[Join the waitlist →](https://bopple.dev)**

---

## Philosophy

Most async coding agents are built for engineers at a desk who want to parallelize work. Bopple is built for the developer who wants to keep shipping while living their life.

You shouldn't have to be at your laptop to make progress on your codebase. A task should feel like texting a capable teammate — not configuring a dev tool.

That's what Bopple is.

---

## License

MIT

---

*Built by [@jayptz](https://github.com/jayptz)*
