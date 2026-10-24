-- ACHANG-AUTH-20261024-P0-001
-- Prepared for Owner review. Do not apply to production before the deployment gate.

alter table public.members
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id) on delete set null,
  add column if not exists deletion_reason text,
  add column if not exists application_code_hash text,
  add column if not exists application_code_expires_at timestamptz;

alter table public.members
  add constraint members_deletion_reason_length
  check (deletion_reason is null or char_length(deletion_reason) between 2 and 500) not valid,
  add constraint members_application_code_hash_format
  check (application_code_hash is null or application_code_hash ~ '^[0-9a-f]{64}$') not valid;

create index if not exists members_active_name_idx
  on public.members (display_name) where deleted_at is null;

create unique index if not exists members_application_code_hash_key
  on public.members (application_code_hash) where application_code_hash is not null;

alter table public.member_accounts
  add column if not exists login_id text,
  add column if not exists requested_at timestamptz,
  add column if not exists rejected_at timestamptz,
  add column if not exists rejection_reason text;

-- Existing accounts receive a stable member-specific identifier. Contact phone is never
-- used as an account key, so two members may continue sharing the same number.
update public.member_accounts
set login_id = 'ACH-' || upper(replace(member_id::text, '-', '')),
    requested_at = coalesce(requested_at, created_at)
where role = 'volunteer' and login_id is null;

alter table public.member_accounts
  add constraint member_accounts_login_id_format
  check (login_id is null or login_id ~ '^ACH-[A-F0-9]{32}$') not valid,
  add constraint member_accounts_rejection_reason_length
  check (rejection_reason is null or char_length(rejection_reason) between 2 and 500) not valid;

create unique index if not exists member_accounts_login_id_key
  on public.member_accounts (login_id) where login_id is not null;

alter table public.member_devices
  add column if not exists requested_at timestamptz default now(),
  add column if not exists rejection_reason text;

alter table public.member_devices
  add constraint member_devices_rejection_reason_length
  check (rejection_reason is null or char_length(rejection_reason) between 2 and 500) not valid;

-- A revoked binding is immutable history. A new request from the same physical device
-- creates a new row; only one pending/approved row may exist for that account + device.
alter table public.member_devices
  drop constraint if exists member_devices_account_id_device_id_hash_key;

drop index if exists public.member_devices_account_id_device_id_hash_key;

create unique index if not exists member_devices_current_binding_key
  on public.member_devices (account_id, device_id_hash)
  where status in ('pending', 'approved');

-- Keep account history lookups indexed after replacing the old full unique index
-- with the partial current-binding constraint above.
create index if not exists member_devices_account_id_idx
  on public.member_devices (account_id);

create table if not exists public.member_authorization_events (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references public.members(id) on delete restrict,
  account_id uuid references public.member_accounts(id) on delete set null,
  device_id uuid references public.member_devices(id) on delete set null,
  event_type text not null check (event_type in (
    'account_requested','account_approved','account_rejected','account_suspended',
    'device_requested','device_approved','device_revoked','member_archived'
  )),
  reason text,
  actor_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.member_authorization_events enable row level security;

revoke all on table public.member_authorization_events from anon;
grant select on table public.member_authorization_events to authenticated;

create policy member_authorization_events_admin_select
  on public.member_authorization_events for select to authenticated
  using ((select app_private.is_admin()));

create index if not exists members_deleted_by_idx
  on public.members (deleted_by) where deleted_by is not null;

create index if not exists member_authorization_events_member_id_idx
  on public.member_authorization_events (member_id);

create index if not exists member_authorization_events_account_id_idx
  on public.member_authorization_events (account_id) where account_id is not null;

create index if not exists member_authorization_events_device_id_idx
  on public.member_authorization_events (device_id) where device_id is not null;

create index if not exists member_authorization_events_created_at_idx
  on public.member_authorization_events (created_at desc);

create or replace function app_private.audit_achang_authorization_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'member_accounts' then
    if tg_op = 'INSERT' then
      insert into public.member_authorization_events(member_id,account_id,event_type,actor_user_id)
      values(new.member_id,new.id,'account_requested',auth.uid());
    elsif old.status is distinct from new.status then
      insert into public.member_authorization_events(member_id,account_id,event_type,reason,actor_user_id)
      values(new.member_id,new.id,
        case new.status when 'active' then 'account_approved' when 'suspended' then
          case when new.rejected_at is not null then 'account_rejected' else 'account_suspended' end
        else 'account_requested' end,
        new.rejection_reason,auth.uid());
    end if;
  elsif tg_table_name = 'member_devices' then
    if tg_op = 'INSERT' then
      insert into public.member_authorization_events(member_id,account_id,device_id,event_type,actor_user_id)
      select a.member_id,new.account_id,new.id,'device_requested',auth.uid()
      from public.member_accounts a where a.id=new.account_id;
    elsif old.status is distinct from new.status then
      insert into public.member_authorization_events(member_id,account_id,device_id,event_type,reason,actor_user_id)
      select a.member_id,new.account_id,new.id,
        case new.status when 'approved' then 'device_approved' else 'device_revoked' end,
        new.rejection_reason,auth.uid()
      from public.member_accounts a where a.id=new.account_id;
    end if;
  elsif tg_table_name = 'members' and old.deleted_at is null and new.deleted_at is not null then
    update public.members
      set application_code_hash=null, application_code_expires_at=null
      where id=new.id and application_code_hash is not null;
    update public.member_accounts
      set status='suspended', updated_at=now()
      where member_id=new.id and status<>'suspended';
    update public.member_devices d
      set status='revoked', revoked_at=coalesce(revoked_at,now())
      from public.member_accounts a
      where d.account_id=a.id and a.member_id=new.id and d.status<>'revoked';
    insert into public.member_authorization_events(member_id,event_type,reason,actor_user_id)
    values(new.id,'member_archived',new.deletion_reason,auth.uid());
  end if;
  return new;
end
$$;

revoke all on function app_private.audit_achang_authorization_change() from public;

drop trigger if exists member_accounts_authorization_audit on public.member_accounts;
create trigger member_accounts_authorization_audit
after insert or update of status on public.member_accounts
for each row execute function app_private.audit_achang_authorization_change();

drop trigger if exists member_devices_authorization_audit on public.member_devices;
create trigger member_devices_authorization_audit
after insert or update of status on public.member_devices
for each row execute function app_private.audit_achang_authorization_change();

drop trigger if exists members_soft_delete_authorization on public.members;
create trigger members_soft_delete_authorization
after update of deleted_at on public.members
for each row execute function app_private.audit_achang_authorization_change();
