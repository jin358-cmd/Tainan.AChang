create or replace function public.achang_member_admin_v2_archive(
  p_account_id uuid,
  p_expected_status text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_account public.member_accounts%rowtype;
  v_member public.members%rowtype;
  v_now timestamptz := statement_timestamp();
  v_reason text := nullif(left(trim(coalesce(p_reason,'')),500),'');
  v_principal_hash text;
begin
  if v_actor is null or not app_private.is_admin() then
    raise exception using errcode = '42501', message = 'active administrator required';
  end if;
  if p_expected_status not in ('pending','active','suspended') then
    raise exception using errcode = '22023', message = 'invalid expected member status';
  end if;
  if v_reason is null or char_length(v_reason) < 2 then
    raise exception using errcode = '22023', message = 'archive reason required';
  end if;

  -- Serialize archive decisions that could remove the last active administrator.
  perform pg_catalog.pg_advisory_xact_lock(20261028140901);

  select * into v_account
  from public.member_accounts
  where id = p_account_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'member account not found';
  end if;
  if v_account.status is distinct from p_expected_status then
    raise exception using errcode = '40001', message = 'member account status changed';
  end if;
  if v_account.auth_user_id = v_actor then
    raise exception using errcode = '23514', message = 'administrator cannot archive own account';
  end if;

  v_principal_hash := encode(extensions.digest(v_account.auth_user_id::text,'sha256'),'hex');
  if v_principal_hash in (
    '0c547cdd53e62896571f12b7ed9e2aaa2f0bf5361aad782f1a2e9eb362202ee6',
    'aafea9485fd742b9c78d4eea26f9368c0b4800f1823075bee0f3bd8787f9cf45'
  ) then
    raise exception using errcode = '23514', message = 'protected principal cannot be archived';
  end if;

  select * into v_member
  from public.members
  where id = v_account.member_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'member not found';
  end if;
  if v_member.deleted_at is not null then
    raise exception using errcode = '40001', message = 'member already archived';
  end if;

  if v_account.role = 'admin' and v_account.status = 'active' and not exists (
    select 1 from public.member_accounts other
    join public.members other_member on other_member.id = other.member_id
    where other.role = 'admin' and other.status = 'active'
      and other.id <> v_account.id and other_member.deleted_at is null
  ) then
    raise exception using errcode = '23514', message = 'last active administrator cannot be archived';
  end if;

  update public.member_devices set
    status = 'revoked', revoked_at = coalesce(revoked_at,v_now),
    rejection_reason = coalesce(rejection_reason,'會員已封存')
  where account_id = v_account.id and status <> 'revoked';

  update public.member_accounts set
    status = 'suspended', suspended_at = v_now, suspended_by = v_actor,
    rejection_reason = v_reason, updated_at = v_now
  where id = v_account.id and status = p_expected_status
  returning * into v_account;
  if not found then
    raise exception using errcode = '40001', message = 'member account status changed';
  end if;

  delete from public.service_allocations where member_id = v_account.member_id;

  update public.members set
    deleted_at = v_now, deleted_by = v_actor, deletion_reason = v_reason,
    application_code_hash = null, application_code_expires_at = null,
    updated_at = v_now
  where id = v_account.member_id and deleted_at is null
  returning * into v_member;
  if not found then
    raise exception using errcode = '40001', message = 'member archive state changed';
  end if;

  insert into public.member_authorization_events(
    member_id, account_id, event_type, reason, actor_user_id, created_at
  ) values (
    v_account.member_id, v_account.id, 'member_archived', v_reason, v_actor, v_now
  );

  return to_jsonb(v_account) || jsonb_build_object('deleted_at',v_member.deleted_at);
end;
$$;

revoke all on function public.achang_member_admin_v2_archive(uuid,text,text) from public, anon;
grant execute on function public.achang_member_admin_v2_archive(uuid,text,text) to authenticated;
