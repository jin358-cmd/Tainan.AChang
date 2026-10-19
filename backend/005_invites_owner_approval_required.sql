-- DRAFT ONLY. Do not apply without Owner action-time confirmation.
-- The Edge Function verifies admin identity/rate limits; raw invite tokens never enter the database.

create table if not exists public.member_invites (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  used_at timestamptz,
  revoked_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);

create table if not exists public.membership_applications (
  id uuid primary key default gen_random_uuid(),
  invite_id uuid not null unique references public.member_invites(id),
  display_name text not null check (length(btrim(display_name)) between 1 and 80),
  phone_e164 text not null check (phone_e164 ~ '^\+8869[0-9]{8}$'),
  status text not null default 'pending' check (status in ('pending','approved','rejected','activated')),
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id),
  activated_at timestamptz,
  account_id uuid references public.member_accounts(id)
);

create unique index if not exists one_pending_application_per_phone
  on public.membership_applications(phone_e164) where status in ('pending','approved');

alter table public.member_invites enable row level security;
alter table public.membership_applications enable row level security;
revoke all on public.member_invites, public.membership_applications from public, anon, authenticated;

create or replace function app_private.consume_member_invite(
  p_token_hash text,
  p_display_name text,
  p_phone_e164 text
) returns table(application_id uuid, application_status text)
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_invite public.member_invites%rowtype;
  v_application_id uuid;
begin
  if p_token_hash !~ '^[0-9a-f]{64}$' or p_phone_e164 !~ '^\+8869[0-9]{8}$'
     or length(btrim(coalesce(p_display_name,''))) not between 1 and 80 then
    raise exception using errcode='22023', message='invalid application';
  end if;

  select * into v_invite from public.member_invites
  where token_hash=p_token_hash for update;
  if v_invite.id is null or v_invite.revoked_at is not null or v_invite.used_at is not null
     or v_invite.expires_at <= now() then
    raise exception using errcode='22023', message='invite unavailable';
  end if;
  if exists(select 1 from public.membership_applications
            where phone_e164=p_phone_e164 and status in ('pending','approved')) then
    raise exception using errcode='23505', message='application already pending';
  end if;

  insert into public.membership_applications(invite_id,display_name,phone_e164)
  values(v_invite.id,btrim(p_display_name),p_phone_e164)
  returning id into v_application_id;
  update public.member_invites set used_at=now() where id=v_invite.id;
  return query select v_application_id,'pending'::text;
end;
$$;

revoke all on function app_private.consume_member_invite(text,text,text) from public, anon, authenticated;
grant execute on function app_private.consume_member_invite(text,text,text) to service_role;

-- Rollback (only if this migration was applied and no approved data must be retained):
-- drop function if exists app_private.consume_member_invite(text,text,text);
-- drop table if exists public.membership_applications;
-- drop table if exists public.member_invites;
