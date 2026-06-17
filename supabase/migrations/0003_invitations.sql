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
