-- ACHANG-AUTH-20261024-P0-001 continuation
-- Apply to the isolated TEST project first. No Production execution is implied.

alter table public.member_authorization_events
  add column if not exists subject_hash text;

alter table public.member_authorization_events
  drop constraint if exists member_authorization_events_event_type_check;

alter table public.member_authorization_events
  add constraint member_authorization_events_event_type_check
  check (event_type in (
    'account_requested','account_approved','account_rejected','account_suspended',
    'account_reactivated','device_requested','device_approved','device_revoked',
    'member_archived','invite_issued','invite_consumed','admin_created',
    'login_succeeded','login_failed'
  )) not valid,
  add constraint member_authorization_events_subject_hash_format
  check (subject_hash is null or subject_hash ~ '^[0-9a-f]{64}$') not valid;

alter table public.member_authorization_events
  validate constraint member_authorization_events_event_type_check,
  validate constraint member_authorization_events_subject_hash_format;

create index if not exists member_authorization_events_subject_hash_created_idx
  on public.member_authorization_events (subject_hash, created_at desc)
  where subject_hash is not null;

create or replace function app_private.audit_achang_invite_issue()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.application_code_hash is distinct from old.application_code_hash
     and new.application_code_hash is not null then
    insert into public.member_authorization_events(member_id,event_type,actor_user_id)
    values(new.id,'invite_issued',auth.uid());
  end if;
  return new;
end
$$;

revoke all on function app_private.audit_achang_invite_issue() from public;

drop trigger if exists members_invite_issue_audit on public.members;
create trigger members_invite_issue_audit
after update of application_code_hash on public.members
for each row execute function app_private.audit_achang_invite_issue();

create or replace function public.achang_claim_member_invitation(
  p_code_hash text,
  p_phone text,
  p_subject_hash text
)
returns table(member_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  claimed_member_id uuid;
begin
  if p_code_hash !~ '^[0-9a-f]{64}$'
     or p_subject_hash !~ '^[0-9a-f]{64}$'
     or p_phone !~ '^\+8869[0-9]{8}$' then
    return;
  end if;

  update public.members m
  set application_code_hash = null,
      application_code_expires_at = null
  where m.application_code_hash = p_code_hash
    and m.phone_e164 = p_phone
    and m.deleted_at is null
    and m.application_code_expires_at > statement_timestamp()
    and not exists (
      select 1 from public.member_accounts a where a.member_id = m.id
    )
  returning m.id into claimed_member_id;

  if claimed_member_id is null then
    return;
  end if;

  insert into public.member_authorization_events(
    member_id,event_type,subject_hash,actor_user_id
  ) values (
    claimed_member_id,'invite_consumed',p_subject_hash,null
  );

  return query select claimed_member_id;
end
$$;

revoke all on function public.achang_claim_member_invitation(text,text,text)
  from public, anon, authenticated;
grant execute on function public.achang_claim_member_invitation(text,text,text)
  to service_role;

