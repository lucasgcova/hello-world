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
