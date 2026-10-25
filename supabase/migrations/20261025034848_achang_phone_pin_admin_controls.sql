-- ACHANG-P0-KAEL-20261025-001
-- Phone + PIN login, administrator device approval, and last-admin protection.
-- Apply to the isolated Test project first. Existing administrator access is retained.

alter table public.member_accounts
  add column if not exists device_approval_required boolean not null default true;

-- Existing administrators are the controlled recovery path during migration. New
-- administrators keep the default true and therefore require device approval.
update public.member_accounts
set device_approval_required = false
where role = 'admin';

create index if not exists member_accounts_profile_edit_granted_by_idx
  on public.member_accounts (profile_edit_granted_by)
  where profile_edit_granted_by is not null;

create index if not exists member_authorization_events_actor_user_id_idx
  on public.member_authorization_events (actor_user_id)
  where actor_user_id is not null;

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

create or replace function app_private.prevent_last_active_admin_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.role = 'admin' and old.status = 'active'
     and (new.role <> 'admin' or new.status <> 'active') then
    perform pg_advisory_xact_lock(hashtext('achang-active-admin-guard'));
    if not exists (
      select 1 from public.member_accounts a
      join public.members m on m.id = a.member_id
      where a.id <> old.id
        and a.role = 'admin'
        and a.status = 'active'
        and m.deleted_at is null
    ) then
      raise exception using
        errcode = '23514',
        message = 'cannot disable the final active administrator';
    end if;
  end if;
  return new;
end
$$;

revoke all on function app_private.prevent_last_active_admin_change() from public;

drop trigger if exists member_accounts_last_admin_guard on public.member_accounts;
create trigger member_accounts_last_admin_guard
before update of role, status on public.member_accounts
for each row execute function app_private.prevent_last_active_admin_change();
