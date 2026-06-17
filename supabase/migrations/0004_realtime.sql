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
