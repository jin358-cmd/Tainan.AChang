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

-- A second physical device receives its own independent authorization row.
insert into public.member_devices(account_id,device_id_hash,status,approved_at)
values('30000000-0000-4000-8000-000000000001',repeat('b',64),'approved',now());

update public.member_devices
set status='revoked',revoked_at=now(),rejection_reason='isolated second-device revoke'
where account_id='30000000-0000-4000-8000-000000000001' and device_id_hash=repeat('b',64);

do $$
begin
  if (select count(*) from public.member_devices where account_id='30000000-0000-4000-8000-000000000001')<>3 then
    raise exception 'independent multi-device history was not preserved';
  end if;
  if not exists(select 1 from public.member_devices where account_id='30000000-0000-4000-8000-000000000001' and device_id_hash=repeat('a',64) and status='approved') then
    raise exception 'revoking device B changed approved device A';
  end if;
end $$;

-- Suspending and reactivating the account must not mutate device states.
update public.member_accounts
set status='suspended',suspended_at=now(),rejection_reason='isolated account suspension'
where id='30000000-0000-4000-8000-000000000001';

update public.member_accounts
set status='active',reactivated_at=now(),rejection_reason=null
where id='30000000-0000-4000-8000-000000000001';

do $$
begin
  if not exists(select 1 from public.member_authorization_events where account_id='30000000-0000-4000-8000-000000000001' and event_type='account_reactivated') then
    raise exception 'account reactivation audit event missing';
  end if;
  if not exists(select 1 from public.member_devices where account_id='30000000-0000-4000-8000-000000000001' and device_id_hash=repeat('a',64) and status='approved') then
    raise exception 'account reactivation changed approved device state';
  end if;
  if not exists(select 1 from public.member_devices where account_id='30000000-0000-4000-8000-000000000001' and device_id_hash=repeat('b',64) and status='revoked') then
    raise exception 'account reactivation restored a revoked device';
  end if;
end $$;

-- The final usable administrator cannot lose its only approved device. Once a
-- second usable administrator exists, the first device can be revoked.
insert into auth.users(id) values
 ('10000000-0000-4000-8000-000000000003'),
 ('10000000-0000-4000-8000-000000000004');
insert into public.members(id,source_member_id,display_name,phone_e164) values
 ('20000000-0000-4000-8000-000000000004','SYNTH-ADMIN-A','Synthetic admin A','+886922222221'),
 ('20000000-0000-4000-8000-000000000005','SYNTH-ADMIN-B','Synthetic admin B','+886922222222');
insert into public.member_accounts(id,member_id,auth_user_id,role,status,device_approval_required) values
 ('30000000-0000-4000-8000-000000000004','20000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000003','admin','active',true),
 ('30000000-0000-4000-8000-000000000005','20000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000004','admin','active',true);
insert into public.member_devices(id,account_id,device_id_hash,status,approved_at) values
 ('40000000-0000-4000-8000-000000000004','30000000-0000-4000-8000-000000000004',repeat('e',64),'approved',now());

do $$
begin
  begin
    update public.member_devices
    set status='revoked',revoked_at=now()
    where id='40000000-0000-4000-8000-000000000004';
    raise exception 'final usable administrator device revoke unexpectedly succeeded';
  exception when check_violation then
    if sqlerrm <> 'cannot revoke the final usable administrator device' then raise; end if;
  end;
  if (select status from public.member_devices where id='40000000-0000-4000-8000-000000000004') <> 'approved' then
    raise exception 'failed revoke changed the protected device';
  end if;
end $$;

insert into public.member_devices(id,account_id,device_id_hash,status,approved_at) values
 ('40000000-0000-4000-8000-000000000005','30000000-0000-4000-8000-000000000005',repeat('f',64),'approved',now());
update public.member_devices
set status='revoked',revoked_at=now()
where id='40000000-0000-4000-8000-000000000004';

do $$
begin
  if (select status from public.member_devices where id='40000000-0000-4000-8000-000000000004') <> 'revoked' then
    raise exception 'revoke remained blocked after a second usable administrator existed';
  end if;
end $$;

-- Invitation claim checks phone, expiry, account absence and consumes once.
insert into public.members(id,source_member_id,display_name,phone_e164,application_code_hash,application_code_expires_at)
values('20000000-0000-4000-8000-000000000003','SYNTH-INVITE','Synthetic invite','+886911111111',repeat('c',64),now()+interval '1 hour');

do $$
declare
  claimed uuid;
  replayed uuid;
begin
  select member_id into claimed
  from public.achang_claim_member_invitation(repeat('c',64),'+886911111111',repeat('d',64));
  if claimed <> '20000000-0000-4000-8000-000000000003'::uuid then
    raise exception 'atomic invitation claim did not return the intended member';
  end if;
  select member_id into replayed
  from public.achang_claim_member_invitation(repeat('c',64),'+886911111111',repeat('d',64));
  if replayed is not null then
    raise exception 'consumed invitation was replayed';
  end if;
  if not exists (
    select 1 from public.member_authorization_events
    where member_id=claimed and event_type='invite_consumed' and subject_hash=repeat('d',64)
  ) then
    raise exception 'invite consumption audit event missing';
  end if;
end $$;

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
