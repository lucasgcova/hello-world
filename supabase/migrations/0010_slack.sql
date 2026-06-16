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
