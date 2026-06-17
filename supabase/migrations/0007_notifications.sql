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
