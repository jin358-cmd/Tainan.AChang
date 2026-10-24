do $$
declare
  duplicate_members integer;
  distinct_logins integer;
  revoked_devices integer;
begin
  select count(*) into duplicate_members from public.members where phone_e164='+886912345678';
  select count(distinct login_id) into distinct_logins from public.member_accounts;
  select count(*) into revoked_devices from public.member_devices where status='revoked';
  if duplicate_members<>2 then raise exception 'duplicate contact phones were not preserved'; end if;
  if distinct_logins<>2 then raise exception 'member login identifiers are not independent'; end if;
  if revoked_devices<>1 then raise exception 'revoked history changed during migration'; end if;
end $$;

insert into public.member_devices(account_id,device_id_hash,status)
values('30000000-0000-4000-8000-000000000001',repeat('a',64),'pending');

update public.member_devices
set status='approved',approved_at=now()
where account_id='30000000-0000-4000-8000-000000000001' and status='pending';

update public.members
set deleted_at=now(),deletion_reason='isolated migration verification'
where id='20000000-0000-4000-8000-000000000001';

do $$
begin
  if (select status from public.member_accounts where member_id='20000000-0000-4000-8000-000000000001')<>'suspended' then
    raise exception 'soft delete did not suspend account';
  end if;
  if exists(select 1 from public.member_devices d join public.member_accounts a on a.id=d.account_id where a.member_id='20000000-0000-4000-8000-000000000001' and d.status<>'revoked') then
    raise exception 'soft delete did not revoke current devices';
  end if;
  if not exists(select 1 from public.member_authorization_events where member_id='20000000-0000-4000-8000-000000000001' and event_type='member_archived') then
    raise exception 'soft delete audit event missing';
  end if;
end $$;

select 'MIGRATION_ASSERTIONS_PASS' as result;
