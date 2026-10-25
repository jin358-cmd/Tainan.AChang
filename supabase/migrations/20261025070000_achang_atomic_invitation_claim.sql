-- ACHANG-AUTH-20261024-P0-001 continuation
-- Apply to the isolated TEST project first. No Production execution is implied.

alter table public.member_authorization_events
  add column if not exists subject_hash text;

alter table public.member_authorization_events
  drop constraint if exists member_authorization_events_event_type_check,
  drop constraint if exists member_authorization_events_subject_hash_format;

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

-- A newly-created active administrator is not a viable recovery administrator
-- until it has an approved device. Prevent disabling the last administrator who
-- can actually pass the device gate.
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
      select 1
      from public.member_accounts a
      join public.members m on m.id = a.member_id
      where a.id <> old.id
        and a.role = 'admin'
        and a.status = 'active'
        and m.deleted_at is null
        and (
          a.device_approval_required = false
          or exists (
            select 1 from public.member_devices d
            where d.account_id = a.id and d.status = 'approved'
          )
        )
    ) then
      raise exception using
        errcode = '23514',
        message = 'cannot disable the final usable administrator';
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

-- Account-state protection alone is insufficient: revoking the only approved
-- device of the final usable administrator would also lock out administration.
create or replace function app_private.prevent_last_usable_admin_device_revoke()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  protected_admin boolean;
begin
  if old.status = 'approved' and new.status <> 'approved' then
    select exists (
      select 1
      from public.member_accounts a
      join public.members m on m.id = a.member_id
      where a.id = old.account_id
        and a.role = 'admin'
        and a.status = 'active'
        and a.device_approval_required = true
        and m.deleted_at is null
    ) into protected_admin;

    if protected_admin then
      perform pg_advisory_xact_lock(hashtext('achang-active-admin-guard'));
      if not exists (
        select 1
        from public.member_accounts a
        join public.members m on m.id = a.member_id
        where a.role = 'admin'
          and a.status = 'active'
          and m.deleted_at is null
          and (
            a.device_approval_required = false
            or exists (
              select 1
              from public.member_devices d
              where d.account_id = a.id
                and d.status = 'approved'
                and d.id <> old.id
            )
          )
      ) then
        raise exception using
          errcode = '23514',
          message = 'cannot revoke the final usable administrator device';
      end if;
    end if;
  end if;
  return new;
end
$$;

revoke all on function app_private.prevent_last_usable_admin_device_revoke() from public;

drop trigger if exists member_devices_last_admin_guard on public.member_devices;
create trigger member_devices_last_admin_guard
before update of status on public.member_devices
for each row execute function app_private.prevent_last_usable_admin_device_revoke();
