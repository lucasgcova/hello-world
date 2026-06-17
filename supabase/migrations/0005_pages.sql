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
