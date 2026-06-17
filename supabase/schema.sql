-- =============================================================================
-- TeamSpace — consolidated schema (all migrations 0001–0010, in order)
-- Paste this whole file into the Supabase SQL Editor and run it once.
-- (Individual migrations live in supabase/migrations/.)
-- =============================================================================

-- =============================================================================
-- TeamSpace — core schema
-- Notion-style project management for small teams.
-- =============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$ begin
  create type member_role as enum ('owner', 'admin', 'member');
exception when duplicate_object then null; end $$;

do $$ begin
  create type task_priority as enum ('none', 'low', 'medium', 'high', 'urgent');
exception when duplicate_object then null; end $$;

do $$ begin
  create type integration_type as enum ('slack', 'gmail', 'gdrive');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- profiles: one row per auth user
-- ---------------------------------------------------------------------------
create table if not exists profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text,
  full_name   text,
  avatar_url  text,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- workspaces + membership
-- ---------------------------------------------------------------------------
create table if not exists workspaces (
  id          uuid primary key default gen_random_uuid (),
  name        text not null,
  created_by  uuid not null references profiles (id) on delete restrict,
  created_at  timestamptz not null default now()
);

create table if not exists workspace_members (
  workspace_id uuid not null references workspaces (id) on delete cascade,
  user_id      uuid not null references profiles (id) on delete cascade,
  role         member_role not null default 'member',
  created_at   timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create index if not exists workspace_members_user_idx on workspace_members (user_id);

-- ---------------------------------------------------------------------------
-- projects + statuses (Kanban columns) + labels
-- ---------------------------------------------------------------------------
create table if not exists projects (
  id           uuid primary key default gen_random_uuid (),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  name         text not null,
  description  text,
  color        text not null default '#6366f1',
  icon         text not null default '📋',
  archived     boolean not null default false,
  position     double precision not null default 1000,
  created_by   uuid not null references profiles (id) on delete restrict,
  created_at   timestamptz not null default now()
);

create index if not exists projects_workspace_idx on projects (workspace_id);

create table if not exists project_statuses (
  id          uuid primary key default gen_random_uuid (),
  project_id  uuid not null references projects (id) on delete cascade,
  name        text not null,
  color       text not null default '#94a3b8',
  position    double precision not null default 1000,
  is_done     boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists project_statuses_project_idx on project_statuses (project_id);

create table if not exists labels (
  id           uuid primary key default gen_random_uuid (),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  name         text not null,
  color        text not null default '#64748b',
  created_at   timestamptz not null default now()
);

create index if not exists labels_workspace_idx on labels (workspace_id);

-- ---------------------------------------------------------------------------
-- tasks + label links + comments
-- ---------------------------------------------------------------------------
create table if not exists tasks (
  id           uuid primary key default gen_random_uuid (),
  project_id   uuid not null references projects (id) on delete cascade,
  status_id    uuid references project_statuses (id) on delete set null,
  title        text not null,
  description  text,
  priority     task_priority not null default 'none',
  assignee_id  uuid references profiles (id) on delete set null,
  due_date     date,
  position     double precision not null default 1000,
  created_by   uuid not null references profiles (id) on delete restrict,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists tasks_project_idx on tasks (project_id);
create index if not exists tasks_status_idx on tasks (status_id);
create index if not exists tasks_assignee_idx on tasks (assignee_id);

create table if not exists task_labels (
  task_id  uuid not null references tasks (id) on delete cascade,
  label_id uuid not null references labels (id) on delete cascade,
  primary key (task_id, label_id)
);

create table if not exists comments (
  id         uuid primary key default gen_random_uuid (),
  task_id    uuid not null references tasks (id) on delete cascade,
  author_id  uuid not null references profiles (id) on delete cascade,
  body       text not null,
  created_at timestamptz not null default now()
);

create index if not exists comments_task_idx on comments (task_id);

-- ---------------------------------------------------------------------------
-- integrations: per-workspace connection config (Slack / Gmail / Drive)
-- Tokens live in `config` (jsonb); protect with admin-only RLS below.
-- ---------------------------------------------------------------------------
create table if not exists integrations (
  id           uuid primary key default gen_random_uuid (),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  type         integration_type not null,
  config       jsonb not null default '{}'::jsonb,
  enabled      boolean not null default true,
  created_by   uuid references profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (workspace_id, type)
);

-- =============================================================================
-- Functions & triggers
-- =============================================================================

-- Keep updated_at fresh.
create or replace function set_updated_at ()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists tasks_set_updated_at on tasks;
create trigger tasks_set_updated_at
  before update on tasks
  for each row execute function set_updated_at ();

drop trigger if exists integrations_set_updated_at on integrations;
create trigger integrations_set_updated_at
  before update on integrations
  for each row execute function set_updated_at ();

-- Set completed_at when a task moves into a "done" status.
create or replace function sync_task_completed_at ()
returns trigger
language plpgsql
as $$
declare
  status_done boolean := false;
begin
  if new.status_id is not null then
    select is_done into status_done from project_statuses where id = new.status_id;
  end if;

  if status_done and new.completed_at is null then
    new.completed_at := now();
  elsif not coalesce(status_done, false) then
    new.completed_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists tasks_sync_completed on tasks;
create trigger tasks_sync_completed
  before insert or update of status_id on tasks
  for each row execute function sync_task_completed_at ();

-- Create a profile row whenever a new auth user signs up.
create or replace function handle_new_user ()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do update
    set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user ();

-- Make the workspace creator an owner.
create or replace function handle_new_workspace ()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.workspace_members (workspace_id, user_id, role)
  values (new.id, new.created_by, 'owner')
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists on_workspace_created on workspaces;
create trigger on_workspace_created
  after insert on workspaces
  for each row execute function handle_new_workspace ();

-- Seed default Kanban columns for a new project.
create or replace function handle_new_project ()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.project_statuses (project_id, name, color, position, is_done)
  values
    (new.id, 'To do',        '#94a3b8', 1000, false),
    (new.id, 'In progress',  '#3b82f6', 2000, false),
    (new.id, 'In review',    '#a855f7', 3000, false),
    (new.id, 'Done',         '#22c55e', 4000, true);
  return new;
end;
$$;

drop trigger if exists on_project_created on projects;
create trigger on_project_created
  after insert on projects
  for each row execute function handle_new_project ();
-- =============================================================================
-- TeamSpace — Row Level Security
--
-- Access model: a user can touch a row if they are a member of the workspace
-- that owns it. Membership checks go through SECURITY DEFINER helpers so the
-- policies don't recurse on workspace_members' own RLS.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Membership helpers (bypass RLS via SECURITY DEFINER)
-- ---------------------------------------------------------------------------
create or replace function is_workspace_member (_workspace_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from workspace_members
    where workspace_id = _workspace_id and user_id = auth.uid ()
  );
$$;

create or replace function is_workspace_admin (_workspace_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from workspace_members
    where workspace_id = _workspace_id
      and user_id = auth.uid ()
      and role in ('owner', 'admin')
  );
$$;

create or replace function project_workspace (_project_id uuid)
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select workspace_id from projects where id = _project_id;
$$;

create or replace function task_workspace (_task_id uuid)
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select p.workspace_id
  from tasks t
  join projects p on p.id = t.project_id
  where t.id = _task_id;
$$;

-- ---------------------------------------------------------------------------
-- Enable RLS
-- ---------------------------------------------------------------------------
alter table profiles            enable row level security;
alter table workspaces          enable row level security;
alter table workspace_members   enable row level security;
alter table projects            enable row level security;
alter table project_statuses    enable row level security;
alter table labels              enable row level security;
alter table tasks               enable row level security;
alter table task_labels         enable row level security;
alter table comments            enable row level security;
alter table integrations        enable row level security;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
drop policy if exists profiles_select on profiles;
create policy profiles_select on profiles
  for select using (auth.uid () is not null);

drop policy if exists profiles_update_own on profiles;
create policy profiles_update_own on profiles
  for update using (id = auth.uid ()) with check (id = auth.uid ());

-- ---------------------------------------------------------------------------
-- workspaces
-- ---------------------------------------------------------------------------
drop policy if exists workspaces_select on workspaces;
create policy workspaces_select on workspaces
  for select using (is_workspace_member (id));

drop policy if exists workspaces_insert on workspaces;
create policy workspaces_insert on workspaces
  for insert with check (created_by = auth.uid ());

drop policy if exists workspaces_update on workspaces;
create policy workspaces_update on workspaces
  for update using (is_workspace_admin (id)) with check (is_workspace_admin (id));

drop policy if exists workspaces_delete on workspaces;
create policy workspaces_delete on workspaces
  for delete using (is_workspace_admin (id));

-- ---------------------------------------------------------------------------
-- workspace_members
-- ---------------------------------------------------------------------------
drop policy if exists members_select on workspace_members;
create policy members_select on workspace_members
  for select using (is_workspace_member (workspace_id));

drop policy if exists members_insert on workspace_members;
create policy members_insert on workspace_members
  for insert with check (is_workspace_admin (workspace_id));

drop policy if exists members_update on workspace_members;
create policy members_update on workspace_members
  for update using (is_workspace_admin (workspace_id));

-- Admins can remove anyone; members can remove themselves (leave).
drop policy if exists members_delete on workspace_members;
create policy members_delete on workspace_members
  for delete using (is_workspace_admin (workspace_id) or user_id = auth.uid ());

-- ---------------------------------------------------------------------------
-- projects
-- ---------------------------------------------------------------------------
drop policy if exists projects_select on projects;
create policy projects_select on projects
  for select using (is_workspace_member (workspace_id));

drop policy if exists projects_insert on projects;
create policy projects_insert on projects
  for insert with check (is_workspace_member (workspace_id) and created_by = auth.uid ());

drop policy if exists projects_update on projects;
create policy projects_update on projects
  for update using (is_workspace_member (workspace_id)) with check (is_workspace_member (workspace_id));

drop policy if exists projects_delete on projects;
create policy projects_delete on projects
  for delete using (is_workspace_member (workspace_id));

-- ---------------------------------------------------------------------------
-- project_statuses
-- ---------------------------------------------------------------------------
drop policy if exists statuses_all on project_statuses;
create policy statuses_all on project_statuses
  for all using (is_workspace_member (project_workspace (project_id)))
  with check (is_workspace_member (project_workspace (project_id)));

-- ---------------------------------------------------------------------------
-- labels
-- ---------------------------------------------------------------------------
drop policy if exists labels_all on labels;
create policy labels_all on labels
  for all using (is_workspace_member (workspace_id))
  with check (is_workspace_member (workspace_id));

-- ---------------------------------------------------------------------------
-- tasks
-- ---------------------------------------------------------------------------
drop policy if exists tasks_all on tasks;
create policy tasks_all on tasks
  for all using (is_workspace_member (project_workspace (project_id)))
  with check (is_workspace_member (project_workspace (project_id)));

-- ---------------------------------------------------------------------------
-- task_labels
-- ---------------------------------------------------------------------------
drop policy if exists task_labels_all on task_labels;
create policy task_labels_all on task_labels
  for all using (is_workspace_member (task_workspace (task_id)))
  with check (is_workspace_member (task_workspace (task_id)));

-- ---------------------------------------------------------------------------
-- comments
-- ---------------------------------------------------------------------------
drop policy if exists comments_select on comments;
create policy comments_select on comments
  for select using (is_workspace_member (task_workspace (task_id)));

drop policy if exists comments_insert on comments;
create policy comments_insert on comments
  for insert with check (
    is_workspace_member (task_workspace (task_id)) and author_id = auth.uid ()
  );

drop policy if exists comments_update_own on comments;
create policy comments_update_own on comments
  for update using (author_id = auth.uid ()) with check (author_id = auth.uid ());

drop policy if exists comments_delete_own on comments;
create policy comments_delete_own on comments
  for delete using (author_id = auth.uid () or is_workspace_admin (task_workspace (task_id)));

-- ---------------------------------------------------------------------------
-- integrations (hold tokens → admin-only writes)
-- ---------------------------------------------------------------------------
drop policy if exists integrations_select on integrations;
create policy integrations_select on integrations
  for select using (is_workspace_member (workspace_id));

drop policy if exists integrations_write on integrations;
create policy integrations_write on integrations
  for all using (is_workspace_admin (workspace_id))
  with check (is_workspace_admin (workspace_id));
-- =============================================================================
-- TeamSpace — workspace invitations
-- Admins create invitations; invitees accept via a shareable token link.
-- =============================================================================

create table if not exists workspace_invitations (
  id           uuid primary key default gen_random_uuid (),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  email        text not null,
  role         member_role not null default 'member',
  token        uuid not null default gen_random_uuid () unique,
  invited_by   uuid references profiles (id) on delete set null,
  accepted_at  timestamptz,
  created_at   timestamptz not null default now(),
  unique (workspace_id, email)
);

create index if not exists invitations_workspace_idx on workspace_invitations (workspace_id);
create index if not exists invitations_email_idx on workspace_invitations (lower(email));

alter table workspace_invitations enable row level security;

-- Admins manage invitations for their workspace.
drop policy if exists invitations_select on workspace_invitations;
create policy invitations_select on workspace_invitations
  for select using (is_workspace_admin (workspace_id));

drop policy if exists invitations_write on workspace_invitations;
create policy invitations_write on workspace_invitations
  for all using (is_workspace_admin (workspace_id))
  with check (is_workspace_admin (workspace_id));

-- ---------------------------------------------------------------------------
-- get_invitation: read invite details by token (the token is a capability).
-- ---------------------------------------------------------------------------
create or replace function get_invitation (_token uuid)
returns table (
  workspace_id uuid,
  workspace_name text,
  email text,
  role member_role,
  accepted boolean
)
language sql
security definer
set search_path = public
stable
as $$
  select
    i.workspace_id,
    w.name as workspace_name,
    i.email,
    i.role,
    (i.accepted_at is not null) as accepted
  from workspace_invitations i
  join workspaces w on w.id = i.workspace_id
  where i.token = _token;
$$;

-- ---------------------------------------------------------------------------
-- accept_invitation: the invitee joins the workspace.
-- Requires the caller's email to match the invitation. SECURITY DEFINER so the
-- (non-admin) invitee can insert their own membership row.
-- ---------------------------------------------------------------------------
create or replace function accept_invitation (_token uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  inv workspace_invitations%rowtype;
  caller_email text;
begin
  select * into inv from workspace_invitations where token = _token;
  if not found then
    raise exception 'Invitation not found';
  end if;
  if inv.accepted_at is not null then
    -- Already accepted; if the caller is a member, treat as success.
    if exists (
      select 1 from workspace_members
      where workspace_id = inv.workspace_id and user_id = auth.uid ()
    ) then
      return inv.workspace_id;
    end if;
    raise exception 'Invitation already used';
  end if;

  select email into caller_email from auth.users where id = auth.uid ();
  if caller_email is null then
    raise exception 'Not authenticated';
  end if;
  if lower(caller_email) <> lower(inv.email) then
    raise exception 'This invitation was sent to a different email address';
  end if;

  insert into workspace_members (workspace_id, user_id, role)
  values (inv.workspace_id, auth.uid (), inv.role)
  on conflict (workspace_id, user_id) do nothing;

  update workspace_invitations set accepted_at = now() where id = inv.id;

  return inv.workspace_id;
end;
$$;
-- =============================================================================
-- TeamSpace — enable Realtime
-- Adds collaborative tables to the supabase_realtime publication so clients can
-- subscribe to live changes. RLS still governs which rows a user receives.
-- =============================================================================

-- Ensure the publication exists (it does by default on Supabase).
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

-- Add tables idempotently.
do $$
declare
  t text;
begin
  foreach t in array array['tasks', 'comments', 'project_statuses'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
-- =============================================================================
-- TeamSpace — docs / wiki pages
-- Nested, block-based pages (Notion-style). Blocks are stored as a JSON array.
-- =============================================================================

create table if not exists pages (
  id           uuid primary key default gen_random_uuid (),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  parent_id    uuid references pages (id) on delete cascade,
  title        text not null default 'Untitled',
  icon         text not null default '📄',
  content      jsonb not null default '[]'::jsonb,
  position     double precision not null default 1000,
  archived     boolean not null default false,
  created_by   uuid not null references profiles (id) on delete restrict,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists pages_workspace_idx on pages (workspace_id);
create index if not exists pages_parent_idx on pages (parent_id);

drop trigger if exists pages_set_updated_at on pages;
create trigger pages_set_updated_at
  before update on pages
  for each row execute function set_updated_at ();

alter table pages enable row level security;

drop policy if exists pages_all on pages;
create policy pages_all on pages
  for all using (is_workspace_member (workspace_id))
  with check (is_workspace_member (workspace_id));

-- Realtime for collaborative editing presence/refresh.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pages'
  ) then
    alter publication supabase_realtime add table public.pages;
  end if;
end $$;
-- =============================================================================
-- TeamSpace — Google (Gmail + Drive) connection
-- One OAuth connection per workspace grants both Gmail and Drive. Tokens are
-- sensitive: the table is admin-only and read server-side with the service role
-- for capability calls. Members see connection status via a SECURITY DEFINER fn.
-- =============================================================================

create table if not exists google_connections (
  workspace_id  uuid primary key references workspaces (id) on delete cascade,
  email         text,
  access_token  text not null,
  refresh_token text,
  expiry        timestamptz,
  scope         text,
  connected_by  uuid references profiles (id) on delete set null,
  updated_at    timestamptz not null default now()
);

drop trigger if exists google_connections_set_updated_at on google_connections;
create trigger google_connections_set_updated_at
  before update on google_connections
  for each row execute function set_updated_at ();

alter table google_connections enable row level security;

-- Tokens are admin-only at the row level.
drop policy if exists google_admin_all on google_connections;
create policy google_admin_all on google_connections
  for all using (is_workspace_admin (workspace_id))
  with check (is_workspace_admin (workspace_id));

-- Members can read connection status (no tokens) via this function.
create or replace function google_connection_info (_workspace_id uuid)
returns table (connected boolean, email text)
language sql
security definer
set search_path = public
stable
as $$
  select
    exists (select 1 from google_connections g where g.workspace_id = _workspace_id) as connected,
    (select g.email from google_connections g where g.workspace_id = _workspace_id) as email
  where is_workspace_member (_workspace_id);
$$;
-- =============================================================================
-- TeamSpace — notifications
-- In-app notifications for mentions, comments, and task assignments.
-- =============================================================================

create table if not exists notifications (
  id           uuid primary key default gen_random_uuid (),
  user_id      uuid not null references profiles (id) on delete cascade,
  workspace_id uuid not null references workspaces (id) on delete cascade,
  actor_id     uuid references profiles (id) on delete set null,
  type         text not null,
  body         text not null,
  link         text,
  read         boolean not null default false,
  created_at   timestamptz not null default now()
);

create index if not exists notifications_user_idx
  on notifications (user_id, created_at desc);

alter table notifications enable row level security;

-- Recipients read/update/delete their own notifications.
drop policy if exists notifications_select on notifications;
create policy notifications_select on notifications
  for select using (user_id = auth.uid ());

drop policy if exists notifications_update on notifications;
create policy notifications_update on notifications
  for update using (user_id = auth.uid ()) with check (user_id = auth.uid ());

drop policy if exists notifications_delete on notifications;
create policy notifications_delete on notifications
  for delete using (user_id = auth.uid ());

-- Any workspace member may create a notification for another member
-- (e.g. mentioning or assigning a teammate).
drop policy if exists notifications_insert on notifications;
create policy notifications_insert on notifications
  for insert with check (is_workspace_member (workspace_id));

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;
-- =============================================================================
-- TeamSpace — task attachments
-- Links and Google Drive files attached to tasks.
-- =============================================================================

create table if not exists task_attachments (
  id          uuid primary key default gen_random_uuid (),
  task_id     uuid not null references tasks (id) on delete cascade,
  title       text not null,
  url         text not null,
  mime_type   text,
  source      text not null default 'link', -- 'link' | 'drive'
  created_by  uuid references profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists task_attachments_task_idx on task_attachments (task_id);

alter table task_attachments enable row level security;

drop policy if exists task_attachments_all on task_attachments;
create policy task_attachments_all on task_attachments
  for all using (is_workspace_member (task_workspace (task_id)))
  with check (is_workspace_member (task_workspace (task_id)));
-- =============================================================================
-- TeamSpace — saved board views
-- Named combinations of view mode + filters + sort, shared per project.
-- =============================================================================

create table if not exists project_views (
  id          uuid primary key default gen_random_uuid (),
  project_id  uuid not null references projects (id) on delete cascade,
  name        text not null,
  config      jsonb not null default '{}'::jsonb,
  position    double precision not null default 1000,
  created_by  uuid references profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists project_views_project_idx on project_views (project_id);

alter table project_views enable row level security;

drop policy if exists project_views_all on project_views;
create policy project_views_all on project_views
  for all using (is_workspace_member (project_workspace (project_id)))
  with check (is_workspace_member (project_workspace (project_id)));
-- =============================================================================
-- TeamSpace — Slack installation (inbound: slash commands + events)
-- Maps a Slack workspace (team) to a TeamSpace workspace + default project.
-- Inbound endpoints read this with the service role; admins manage it.
-- =============================================================================

create table if not exists slack_installations (
  workspace_id       uuid primary key references workspaces (id) on delete cascade,
  slack_team_id      text not null unique,
  default_project_id uuid references projects (id) on delete set null,
  created_by         uuid references profiles (id) on delete set null,
  updated_at         timestamptz not null default now()
);

drop trigger if exists slack_installations_set_updated_at on slack_installations;
create trigger slack_installations_set_updated_at
  before update on slack_installations
  for each row execute function set_updated_at ();

alter table slack_installations enable row level security;

drop policy if exists slack_installations_admin on slack_installations;
create policy slack_installations_admin on slack_installations
  for all using (is_workspace_admin (workspace_id))
  with check (is_workspace_admin (workspace_id));
