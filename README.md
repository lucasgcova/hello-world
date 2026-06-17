# TeamSpace

A Notion-style project-management app for small teams, connected to **Gmail**,
**Google Drive**, **Slack**, and **Claude** (via the Anthropic API).

A real, runnable build covering the project-management core, docs, team
collaboration, AI, and external integrations.

## Quickstart — get a working instance (~10 min)

You need two free accounts: **Supabase** (database + auth) and **Anthropic**
(Claude). Everything else is optional.

1. **Supabase** → create a project. In **SQL Editor**, paste
   [`supabase/schema.sql`](supabase/schema.sql) and run it once.
2. **Auth** → Project Settings → Authentication: email magic links work as-is.
   (Optional: enable the Google provider for "Continue with Google".)
3. **Anthropic** → create an API key at console.anthropic.com.
4. **Deploy** — click the button below (works once this is on your default
   branch), then set the env vars when prompted:

   [![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Flucasgcova%2Fhello-world&env=NEXT_PUBLIC_SUPABASE_URL,NEXT_PUBLIC_SUPABASE_ANON_KEY,ANTHROPIC_API_KEY,NEXT_PUBLIC_SITE_URL)

   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase →
     Project Settings → API
   - `ANTHROPIC_API_KEY` — from step 3
   - `NEXT_PUBLIC_SITE_URL` — your deployed URL (set after first deploy, then
     redeploy; also add it to Supabase → Auth → URL Configuration)

   **Or run locally:** `npm install`, copy `.env.example` → `.env.local`, fill
   the three vars above (`NEXT_PUBLIC_SITE_URL=http://localhost:3000`), then
   `npm run dev`.

5. Open the app, create a workspace, add a project, and start working. Click
   **✨ Assistant** to talk to Claude.

Optional add-ons (Slack, Gmail/Drive, service role) are covered under
[Setup](#setup) below.

## Features

- ✅ **Auth** — Google sign-in + email magic links (Supabase Auth)
- ✅ **Workspaces & members** — multi-workspace switching, role-based access
- ✅ **Team invitations** — invite by email with shareable links; manage members
- ✅ **Projects & boards** — Kanban (drag & drop), List, and Table views
- ✅ **Tasks** — status, priority, assignee, due date, description, comments,
  labels
- ✅ **Filtering & sorting** — by search, assignee, priority, label; sort by
  priority / due date / newest
- ✅ **Docs / wiki** — Notion-style nested pages with a block editor
  (headings, lists, to-dos, quotes, code, dividers, slash commands)
- ✅ **Realtime** — boards and comments update live across the team
- ✅ **Claude AI assistant** — streaming chat with tool-calling: create tasks,
  summarize the board, move work, and search Drive/Gmail
- ✅ **Integrations** — Slack notifications (real), Google Gmail + Drive via
  OAuth (real), Claude (real); clean adapter layer for adding more
- ✅ **Row Level Security** — every table is protected; users only see their
  workspaces

- ✅ **Drag-to-reorder** tasks within and across columns
- ✅ **Notifications + @mentions** — in-app bell, assignment/comment/mention alerts
- ✅ **Attachments** — links and Drive files on tasks; **Gmail send** via the assistant
- ✅ **Saved views** — named filter/sort/mode combos + per-user default
- ✅ **Two-way Slack** — `/teamspace add|list` slash command and app-mention task creation

### Roadmap / ideas

- Page ↔ task links and page mentions; email digests
- Full Slack OAuth install flow (vs. manual team-ID link)
- Recurring tasks, dependencies, timeline/calendar views

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

# Option B — paste supabase/schema.sql (all migrations bundled, in order) into
# the Supabase SQL Editor and run it once.
```

Then enable Realtime: the migrations add the relevant tables to the
`supabase_realtime` publication automatically.

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

For **two-way Slack** (slash command + mentions): create a Slack app, set
`SLACK_SIGNING_SECRET`, point the slash command (`/teamspace`) at
`${SITE}/api/slack/commands` and Event Subscriptions at
`${SITE}/api/slack/events` (subscribe to `app_mention`), add a bot token
(`SLACK_BOT_TOKEN`) so mention replies post back, then link your Slack Team ID +
default project in **Settings → Integrations** (admins). Requires
`SUPABASE_SERVICE_ROLE_KEY`.

### 5b. (Optional) Connect Gmail + Drive

1. In the [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
   create an **OAuth client (Web application)**.
2. Add the redirect URI `${NEXT_PUBLIC_SITE_URL}/api/integrations/google/callback`
   (e.g. `http://localhost:3000/api/integrations/google/callback`).
3. Enable the **Gmail API** and **Drive API** for the project.
4. Put the client id/secret in `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.
5. Set `SUPABASE_SERVICE_ROLE_KEY` (the assistant reads Google tokens
   server-side with it; tokens are never exposed to the browser).
6. In the app, go to **Settings → Integrations → Connect** (workspace admins).

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

- **Slack** — notification adapter (`src/lib/integrations/slack.ts`) registered
  in the registry. `notifyAll()` fans out through every configured adapter and
  never throws, so a failing integration can't break the action that triggered
  it. New tasks post to Slack.
- **Google (Gmail + Drive)** — real OAuth in `src/lib/integrations/google.ts`.
  One per-workspace connection grants both. Tokens live in the admin-only
  `google_connections` table and are read/refreshed server-side with the service
  role; the AI assistant calls `search_drive` / `search_email` tools.
- **Adding a new notifier** — implement the `IntegrationAdapter` interface and
  register it in `registry.ts`; it's picked up everywhere automatically.

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
