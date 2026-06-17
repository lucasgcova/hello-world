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
