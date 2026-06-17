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
