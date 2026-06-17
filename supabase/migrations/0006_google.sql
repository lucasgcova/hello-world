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
