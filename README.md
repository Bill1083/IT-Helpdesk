# IT Desk

A personal IT problem solver. Log what a user told you, and it walks you through the fix **one step at a time**: you
report back ("didn't work", "different error", a screenshot) and it gives the next step. It remembers every problem,
so a new one that sounds like an old one shows *"This sounds like an issue from 3 Oct (Jane): … Fixed by: …"* and
tries that fix first.

## What it does

- **Four kinds of request.** *Fix* (one step at a time, report back), *How-to* (the full procedure, or how something
  works), *Plan* (phases, risks, decisions) and *Options* (a recommendation and a short comparison). Pick one or leave
  it on Auto.
- **Client environments.** One per client you contract for, each with its own stack description. Answers fit that
  client, but past problems from every client are still matched ("This sounds like an issue from 3 Oct at Acme…").
- **Useful commands.** Every command the AI gives you is saved, split into Windows and Mac, with what it does, when to
  use it, where you used it, and a 1-5 danger rating. A pattern check sets a floor on the rating, so a destructive
  command is flagged even if the AI under-rates it, and it is also flagged inline in the chat.

- **Desktop app.** Installs from Edge or Chrome as its own app window with a taskbar icon. It is a window onto the
  server, so history is the same everywhere.
- **Off-site backups.** A daily database snapshot and new screenshots go to a Cloudflare R2 bucket, with 30 days of
  history and status in Settings.

## How it stays fast

- **One model call per step, streamed.** Words appear within a second or two instead of waiting for the full answer.
- **Specialist playbooks instead of sub-agents.** Rippling, macOS, Windows, Slack, Google Workspace, Microsoft 365,
  AI tools, network, hardware and SSO playbooks are picked instantly by keyword and injected into the one call. Same
  expertise, no extra round-trips between agents.
- **Research runs in the background.** Logging a problem starts three parallel Google-grounded searches (official
  docs, community-confirmed fixes, recent changes) that merge into a brief. Step 1 doesn't wait for it; later steps
  read the brief instead of searching again. Two misses in a row re-run the research with what's been tried.
- **Past problems are matched locally.** Embeddings live in SQLite and compare in under a millisecond.

## Stack

Next.js 15 (standalone) · SQLite (better-sqlite3) · Gemini (`gemini-3.8-flash` steps, `gemini-3.5-flash-lite` titles
and summaries, `gemini-embedding-2` matching) · optional Claude (`claude-opus-5-5` with web search) for **Think
harder**.

## Run locally

```bash
cp .env.example .env
```

```bash
npm install && npm run dev
```

## Deploy

```bash
docker compose up -d --build
```

Full VPS steps (DNS, Nginx, Certbot, backups) are in [DEPLOYMENT.md](DEPLOYMENT.md).
