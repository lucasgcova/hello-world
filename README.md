# TeamSpace

A Notion-style project-management app for small teams, connected to **Gmail**,
**Google Drive**, **Slack**, and **Claude** (via the Anthropic API).

This is the **first milestone** of a larger build. It ships a real, runnable
foundation focused on the project-management core, with the AI assistant and an
extensible integrations layer wired in.

## What's in this milestone

- ✅ **Auth** — Google sign-in + email magic links (Supabase Auth)
- ✅ **Workspaces & members** — one workspace per team, role-based access
- ✅ **Projects & boards** — Kanban (drag & drop), List, and Table views
- ✅ **Tasks** — status, priority, assignee, due date, description, comments
- ✅ **Claude AI assistant** — streaming chat that can create tasks, summarize
  the board, and move work, using tool-calling against your data
- ✅ **Integrations layer** — adapter interfaces for all four services;
  **Slack** wired for real (notifications), **Gmail/Drive** as drop-in stubs
- ✅ **Row Level Security** — every table is protected; users only see their
  workspaces

### Intentionally not in this milestone (next up)

- Rich block editor / nested wiki pages (Notion docs)
- Real Gmail/Drive OAuth (adapters + stubs are in place to fill in)
- Team invitations UI, multi-workspace switching
- Labels UI, filtering/sorting, saved views
- Realtime multiplayer updates

## Tech stack

- **Next.js** (App Router, TypeScript) + **React**
- **Tailwind CSS v4**
- **Supabase** — Postgres + Auth + RLS
- **Anthropic API** (`@anthropic-ai/sdk`) — Claude, server-side
- Deploy target: **Vercel**

---

## Setup

### 1. Install

```bash
npm install
```

### 2. Create a Supabase project

Create one at [supabase.com](https://supabase.com). Then run the migrations
against it. Either paste the SQL files into **SQL Editor** (in order), or use
the Supabase CLI:

```bash
# Option A — Supabase CLI (recommended)
supabase link --project-ref YOUR_PROJECT_REF
supabase db push   # applies supabase/migrations/*.sql

# Option B — copy/paste supabase/migrations/0001_schema.sql then 0002_rls.sql
# into the Supabase SQL Editor and run them in order.
```

### 3. Enable Google sign-in (for "Continue with Google")

In the Supabase dashboard → **Authentication → Providers → Google**, enable it
and add your Google OAuth client ID/secret (create one in the
[Google Cloud Console](https://console.cloud.google.com/apis/credentials)).
Add this redirect URL to both Google and Supabase:

```
https://YOUR-PROJECT.supabase.co/auth/v1/callback
```

Email magic links work out of the box with no extra setup.

### 4. Get a Claude API key

Create one at [console.anthropic.com](https://console.anthropic.com) → API Keys.

### 5. (Optional) Slack notifications

Create an [incoming webhook](https://api.slack.com/messaging/webhooks) and copy
the URL into `SLACK_WEBHOOK_URL`. New tasks will post to that channel.

### 6. Environment variables

```bash
cp .env.example .env.local
# then fill in the values
```

At minimum you need `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
and `ANTHROPIC_API_KEY`.

### 7. Run

```bash
npm run dev
# http://localhost:3000
```

Sign in, create a workspace, create a project, and start adding tasks. Click
**✨ Assistant** (bottom-right) to talk to Claude.

---

## Project structure

```
supabase/migrations/      SQL schema + Row Level Security
src/
  app/
    login/                Auth UI (Google + magic link)
    auth/                 OAuth callback + sign-out
    onboarding/           First-run workspace creation
    (workspace)/          Authenticated app shell + pages
      page.tsx            Home → first project / empty state
      projects/[id]/      Board (Kanban / List / Table)
      settings/           Integrations status
    api/ai/route.ts       Claude streaming + tool-use endpoint
  components/             AppShell, Board, TaskDialog, AssistantPanel
  lib/
    supabase/             Browser/server/middleware clients
    actions/              Server Actions (workspaces, projects, tasks)
    ai/                   Anthropic client, tool definitions, prompt
    integrations/         Adapter interface + slack/gmail/gdrive + registry
    types.ts              Shared domain types
middleware.ts             Session refresh + route protection
```

## How the AI assistant works

`src/app/api/ai/route.ts` runs a streaming tool-use loop with Claude:

1. Loads the user's session (so all DB access is scoped by RLS).
2. Streams text deltas to the browser over SSE.
3. When Claude calls a tool (`create_task`, `list_tasks`, `update_task_status`),
   the server executes it against Supabase **as the signed-in user**, feeds the
   result back, and continues.

The model defaults to `claude-opus-4-8`. Set `ANTHROPIC_MODEL=claude-sonnet-4-6`
for lower cost/latency. Tool definitions and the system prompt live in
`src/lib/ai/tools.ts`.

## How integrations are structured

Every integration implements one interface (`src/lib/integrations/types.ts`) and
registers in `src/lib/integrations/registry.ts`. Slack is fully implemented;
Gmail and Drive are stubs with the same shape, so wiring them later is a
localized change:

1. Create a Google Cloud OAuth app (Gmail + Drive scopes).
2. Implement the method bodies in `gmail.ts` / `gdrive.ts` using the `googleapis`
   client and per-workspace tokens stored in the `integrations` table.

`notifyAll()` fans out a notification through every configured adapter and never
throws, so a failing integration can't break the action that triggered it.

## Deploying to Vercel

1. Push this repo and import it in Vercel.
2. Add all env vars from `.env.example` (use your production Supabase + Anthropic
   keys). Set `NEXT_PUBLIC_SITE_URL` to your Vercel URL.
3. In Supabase → **Authentication → URL Configuration**, add your Vercel domain
   and `https://YOUR-APP.vercel.app/auth/callback` as redirect URLs.

## Regenerating database types (optional)

For end-to-end typed Supabase queries, once your project is linked:

```bash
npm run db:types   # writes src/lib/supabase/database.types.ts
```
