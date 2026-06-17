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
